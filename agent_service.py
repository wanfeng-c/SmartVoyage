"""Agent 服务：LangChain create_agent + MySQL 会话记忆 + MCP 工具。

会话消息持久化在 MySQL（chat_sessions / short_term_messages），
工具调用记录写 query_history；每次请求用最近 10 条历史 + 上下文提示组 prompt。
对外暴露 iter_reply(session_id, text)，产出事件：
  {"type": "session",     "id", "title"}
  {"type": "tool_call",   "name", "args"}
  {"type": "tool_result", "name", "ok", "text"}
  {"type": "token",       "text"}
  {"type": "error",       "text"}
"""

import asyncio
import datetime
import json
import os
import re

import pymysql
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.mcp import MCPAdapter
from langchain_openai import ChatOpenAI

load_dotenv()

MCP_SERVERS = {
    "weather": "http://127.0.0.1:8101",
    "ticket": "http://127.0.0.1:8102",
    "travel": "http://127.0.0.1:8103",
}
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

DB = {
    "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "travel_rag"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
    "connect_timeout": 5,
    "autocommit": True,
}

MAX_HISTORY = 10      # 最多带最近 10 条消息（5 轮）
MAX_REPLY_SECONDS = 150
CITIES = [
    "上海", "南京", "北京", "杭州", "广州", "深圳", "成都", "重庆", "西安", "武汉",
    "苏州", "三亚", "丽江", "昆明", "桂林", "拉萨", "厦门", "青岛", "天津", "大连",
    "日本", "泰国", "韩国", "新加坡",
]
DATE_RE = re.compile(r"今天|明天|后天|大后天|\d{4}-\d{2}-\d{2}")

SYSTEM_PROMPT = (
    f"今天是 {datetime.date.today():%Y-%m-%d}。你是 SmartVoyage 旅游助手，可以查询天气，办理机票、火车票、演唱会票，以及租车、旅游团、旅游保险。"
    "先调用工具查询；预订前必须把出发地、目的地、日期、人数、证件号等关键信息向用户复述确认，用户确认后再调用预订工具。"
    "用户说的“今天/明天/后天”可以直接作为日期参数，不要因为日期是相对说法而反复追问，也不要要求用户换算成具体日期。"
    "天气工具调用和风天气，返回 JSON 格式的真实天气数据，请解析后转成自然语言回答，并注明“数据来源：和风天气”；"
    "机票、火车票、演唱会查询返回 MySQL 数据库里的真实班次、票价与余票（JSON），预订接口仍是模拟；"
    "租车、保险查询返回 MySQL 真实数据，旅游团查询返回 Milvus 向量检索结果（JSON），这三类预订接口仍是模拟。"
    "必须如实说明哪些是真实数据、哪些是模拟，不要编造不存在的班次、价格或保单号。"
    "结合对话历史理解用户省略的信息（例如“那旅游团呢”指前面提到的城市），不要重复询问已经说过的城市或日期。"
    "回答使用简洁中文，可以使用 Markdown（标题、列表、表格）。"
)

_agent = None
_agent_lock = asyncio.Lock()


def _connect():
    return pymysql.connect(**DB)


def _db(sql, params=(), fetch=True):
    """执行一条 SQL，失败返回 None（调用方降级处理）。"""
    try:
        with _connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(sql, params)
                return cursor.fetchall() if fetch else cursor.rowcount
    except Exception as exc:
        print(f"[agent] MySQL 操作失败：{exc}")
        return None


def ensure_session(session_id, text):
    """会话不存在则创建，标题取首条消息前 30 字。"""
    title = (text or "新会话").strip()[:30]
    _db("INSERT IGNORE INTO chat_sessions (id, title) VALUES (%s, %s)", (session_id, title), fetch=False)
    _db("UPDATE chat_sessions SET title=%s WHERE id=%s AND title='新会话'", (title, session_id), fetch=False)


def get_session(session_id):
    rows = _db("SELECT id, title, updated_at FROM chat_sessions WHERE id=%s", (session_id,))
    if not rows:
        return None
    row = rows[0]
    return {"id": row["id"], "title": row["title"], "updated_at": row["updated_at"].strftime("%Y-%m-%d %H:%M")}


def list_sessions(limit=50):
    rows = _db(
        "SELECT s.id, s.title, s.updated_at, COUNT(m.id) AS message_count "
        "FROM chat_sessions s LEFT JOIN short_term_messages m ON m.session_id = s.id "
        "GROUP BY s.id, s.title, s.updated_at ORDER BY s.updated_at DESC LIMIT %s",
        (limit,),
    ) or []
    return [
        {"id": r["id"], "title": r["title"], "updated_at": r["updated_at"].strftime("%Y-%m-%d %H:%M"), "message_count": r["message_count"]}
        for r in rows
    ]


def session_messages(session_id, limit=200):
    rows = _db(
        "SELECT role, content, message_time FROM short_term_messages "
        "WHERE session_id=%s ORDER BY message_order LIMIT %s",
        (session_id, limit),
    ) or []
    return [{"role": r["role"], "content": r["content"], "time": r["message_time"]} for r in rows]


def save_message(session_id, role, content):
    """按会话内递增的 message_order 写入一条消息。"""
    rows = _db("SELECT COALESCE(MAX(message_order), 0) + 1 AS next_order FROM short_term_messages WHERE session_id=%s", (session_id,))
    order = rows[0]["next_order"] if rows else 1
    _db(
        "INSERT INTO short_term_messages (session_id, role, content, message_time, message_order) VALUES (%s, %s, %s, %s, %s)",
        (session_id, role, content, datetime.datetime.now().strftime("%H:%M:%S"), order),
        fetch=False,
    )


def load_history(session_id, limit=MAX_HISTORY):
    rows = _db(
        "SELECT role, content FROM short_term_messages WHERE session_id=%s ORDER BY message_order DESC LIMIT %s",
        (session_id, limit),
    ) or []
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def log_query(intent_type, payload):
    _db(
        "INSERT INTO query_history (intent_type, query_content, query_time) VALUES (%s, %s, %s)",
        (intent_type, json.dumps(payload, ensure_ascii=False), datetime.datetime.now()),
        fetch=False,
    )


def _context_hint(history):
    """从历史用户消息里提取城市/日期，拼成一句提示附在系统消息后。"""
    text = " ".join(item["content"] for item in history if item["role"] == "user")
    if not text:
        return ""
    cities = sorted({c for c in CITIES if c in text}, key=text.find)
    dates = list(dict.fromkeys(DATE_RE.findall(text)))
    if not cities and not dates:
        return ""
    parts = []
    if cities:
        parts.append("提到的城市：" + "、".join(cities))
    if dates:
        parts.append("提到的日期：" + "、".join(dates))
    return "\n（会话上下文：" + "；".join(parts) + "。用户省略城市/日期时沿用这些值。）"


async def _load_tools():
    tools = []
    for name, url in MCP_SERVERS.items():
        try:
            tools.extend(await MCPAdapter(f"{url}/mcp").list_tools())
        except Exception as exc:
            raise RuntimeError(f"无法从 {url}（{name}）加载 MCP 工具：{exc}。请先启动 3 个 MCP 服务。") from exc
    if not tools:
        raise RuntimeError("MCP 服务没有返回任何工具")
    return tools


async def _get_agent():
    global _agent
    async with _agent_lock:
        if _agent is None:
            if not API_KEY:
                raise RuntimeError("缺少 DEEPSEEK_API_KEY 环境变量")
            model = ChatOpenAI(
                model=MODEL,
                base_url=BASE_URL,
                api_key=API_KEY,
                temperature=0.2,
                timeout=60,
                max_retries=2,
                streaming=True,
            )
            _agent = create_agent(model=model, tools=await _load_tools())
        return _agent


async def iter_reply(session_id, text):
    ensure_session(session_id, text)
    history = load_history(session_id)          # 先读历史，再存当前问题，避免重复
    save_message(session_id, "user", text)

    session = get_session(session_id) or {"id": session_id, "title": text[:30]}
    yield {"type": "session", "id": session_id, "title": session["title"]}

    try:
        agent = await _get_agent()
    except Exception as exc:
        yield {"type": "error", "text": str(exc)}
        return

    messages = [{"role": "system", "content": SYSTEM_PROMPT + _context_hint(history)}]
    messages += history
    messages.append({"role": "user", "content": text})

    answer, tool_logs, failed = [], [], False
    try:
        async with asyncio.timeout(MAX_REPLY_SECONDS):
            async for event in agent.astream_events({"messages": messages}, version="v2"):
                kind = event.get("event")
                if kind == "on_chat_model_stream":
                    content = getattr(event.get("data", {}).get("chunk"), "content", "")
                    if isinstance(content, str) and content:
                        answer.append(content)
                        yield {"type": "token", "text": content}
                elif kind == "on_tool_start":
                    tool_logs.append({"name": event.get("name", ""), "args": event.get("data", {}).get("input")})
                    yield {"type": "tool_call", "name": event.get("name", ""), "args": event.get("data", {}).get("input")}
                elif kind == "on_tool_end":
                    output = getattr(event.get("data", {}).get("output"), "content", "")
                    if isinstance(output, list):
                        output = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in output)
                    yield {"type": "tool_result", "name": event.get("name", ""), "ok": True, "text": str(output)}
                elif kind == "on_tool_error":
                    yield {"type": "tool_result", "name": event.get("name", ""), "ok": False, "text": f"工具调用失败：{event.get('data', {}).get('error')}"}
    except TimeoutError:
        failed = True
        yield {"type": "error", "text": f"模型响应超过 {MAX_REPLY_SECONDS} 秒，请稍后重试"}
    except Exception as exc:
        failed = True
        yield {"type": "error", "text": f"调用失败：{exc}"}
    finally:
        reply = "".join(answer).strip()
        if reply:
            save_message(session_id, "assistant", reply)
        for log in tool_logs:
            log_query(log["name"], log.get("args") or {})

    if not answer and not failed:
        yield {"type": "error", "text": "未能生成回复，请重试"}
