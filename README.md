# SmartVoyage 旅游智能体（MVP）

**3 个 MCP 服务 + 1 个 LangChain Agent 服务 + 1 个 FastAPI Web 服务 + 3 个静态前端文件**。
天气走和风天气 API，机票/火车票/演唱会查询走 MySQL（真实数据）；预订、租车、旅游团、保险仍是模拟。

## 技术栈

| 组件 | 实现 |
|---|---|
| Agent 调度 | `langchain` 1.4.7 `create_agent` + `langchain-openai` `ChatOpenAI`（DeepSeek 兼容接口） |
| MCP 服务 | `fastmcp` 4.1.5（由 `langchain[mcp]` 引入），标准 MCP 协议 over streamable HTTP |
| 工具接入 | `langchain.mcp.MCPAdapter` 自动发现并转换成 LangChain 工具 |
| Web 服务 | `fastapi` 0.162.0 + `uvicorn` 0.54.0，SSE 流式返回 |
| 前端 | 原生 HTML + CSS + JS，无构建步骤 |
| 会话记忆 | MySQL 持久化：`chat_sessions` + `short_term_messages`，每次带最近 10 条消息进上下文 |
| 天气数据 | 和风天气 API：GeoAPI 城市检索 + `/v7/weather/7d` 预报 + `/v7/weather/now` 实况 |
| 数据存储 | MySQL 8.0（库 `travel_rag`）：机票 / 火车票 / 演唱会 / 租车 / 保险；驱动 `pymysql` 1.2.3 |
| 向量检索 | Milvus（`127.0.0.1:19530`，collection `tour_groups`）+ DashScope `text-embedding-v3` 1024 维 |

## 架构

```
浏览器 ──► web_service.py :8100 (FastAPI, SSE) ──► agent_service.py (LangChain create_agent)
                                                        │  MCPAdapter.list_tools() → 13 个 LangChain 工具
                    ┌───────────────────────────────────┼───────────────────────────────────┐
                    ▼                                   ▼                                   ▼
        mcp_weather.py :8101/mcp          mcp_ticket.py :8102/mcp            mcp_travel.py :8103/mcp
          天气查询（1 个工具）               票务（6 个工具）                    旅游（6 个工具）
```

每个 MCP 服务都是标准的 streamable HTTP MCP 服务器，入口为 `http://127.0.0.1:<port>/mcp`，可以用任何 MCP 客户端（包括 MCP Inspector）连接调试。

## 依赖

`uv.lock` 已锁定，直接同步即可（`pyproject.toml` 中 5 个直接依赖）：

```powershell
uv sync
```

`langchain[mcp]` 会带入 `fastmcp` / `mcp` / `sse-starlette` 等传递依赖；`python-a2a` 在迁移后已从依赖中移除。

## 启动

先确认 8100–8103 端口空闲，然后开 4 个终端：

```powershell
# 终端 1~3：MCP 服务（控制台会打印每次工具调用）
uv run python mcp_weather.py     # 天气 8101
uv run python mcp_ticket.py      # 票务 8102
uv run python mcp_travel.py      # 旅游 8103

# 终端 4：Web + Agent
uv run python web_service.py     # http://127.0.0.1:8100
```

若 `uv run` 报缓存锁（`Could not acquire lock`），直接用虚拟环境解释器：

```powershell
.\.venv\Scripts\python.exe mcp_weather.py
.\.venv\Scripts\python.exe web_service.py
```

也可以只起 Web 服务（等价写法）：`uv run uvicorn web_service:app --host 127.0.0.1 --port 8100`。

浏览器打开 <http://127.0.0.1:8100>。示例：

- 北京明天天气怎么样？
- 帮我查一下明天北京到上海的机票，然后订 CA1234，乘机人张三，身份证 110101199001011234
- 我想去日本玩 5 天，帮我查一下旅游保险，然后订一份，2 个人

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | 是 | 无 | 未配置时 `/api/chat` 返回明确的 error 事件 |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com/v1` | OpenAI 兼容接口地址 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-flash` | 模型名，可换成 `deepseek-chat` |
| `WEB_PORT` | 否 | `8100` | Web 端口 |
| `MYSQL_HOST` | 否 | `127.0.0.1` | MySQL 地址 |
| `MYSQL_PORT` | 否 | `3306` | MySQL 端口 |
| `MYSQL_USER` | 否 | `root` | 用户名 |
| `MYSQL_PASSWORD` | 是 | 无 | 密码（票务 / 租车 / 保险查询用） |
| `MYSQL_DATABASE` | 否 | `travel_rag` | 库名 |
| `DASHSCOPE_API_KEY` | 是 | 无 | 阿里云百炼 Key，旅游团查询生成 embedding 用 |
| `MILVUS_URI` | 否 | `http://127.0.0.1:19530` | Milvus 地址 |
| `MILVUS_COLLECTION` | 否 | `tour_groups` | 旅游团向量 collection 名 |
| `QWEATHER_HOST` | 是 | 无 | 和风天气 API Host（天气查询用） |
| `QWEATHER_KEY` | 是 | 无 | 和风天气 API Key |

也可以把上述变量写进项目根目录的 `.env`（各服务启动时自动加载）；`.env.example` 是带占位符的模板，复制成 `.env` 后填入真实值即可。`.env` 已被 `.gitignore` 排除，不要提交。

## 接口

`POST /api/chat`，请求 `{"session_id": "abc", "message": "北京明天天气"}`，返回 SSE：

```
data: {"type": "tool_call",   "name": "get_weather", "args": {...}}
data: {"type": "tool_result", "name": "get_weather", "ok": true, "text": "..."}
data: {"type": "token",       "text": "北京"}
data: {"type": "done"}
data: [DONE]
```

`GET /api/health` 返回 `{"status": "ok"}`。

会话接口：

- `GET /api/sessions`：`{"sessions": [{id, title, updated_at, message_count}]}`，按更新时间倒序
- `GET /api/sessions/{id}`：`{"session": {...}, "messages": [{role, content, time}]}`，不存在返回 404

SSE 额外事件：`{"type": "session", "id": "...", "title": "..."}`（首条消息生成标题）。

## 工具清单

| 服务 | 工具 |
|---|---|
| 天气 | `get_weather`（和风天气真实数据，返回 JSON；城市 + 日期，日期默认今天，支持未来 7 天） |
| 票务 | 查询：`search_flights` / `search_trains` / `search_concerts`（MySQL 真实数据，返回 JSON）；预订：`book_flight` / `book_train` / `book_concert`（模拟） |
| 旅游 | 查询：`search_car_rental` / `search_insurance`（MySQL 真实数据）、`search_tour_groups`（Milvus 向量检索）；预订：`book_car_rental` / `book_tour_group` / `book_insurance`（模拟） |

### 天气工具返回格式

`get_weather` 返回 JSON 字符串（当天查询会多一个 `now` 实况对象；出错时返回 `{"error": "...", "city": ..., "date": ...}`）：

```json
{
  "city": "北京",
  "province": "北京市",
  "date": "2026-11-03",
  "condition": "晴",
  "temp_min": 5,
  "temp_max": 18,
  "wind_dir": "东北风",
  "wind_scale": "1-3",
  "humidity": 51,
  "precip_mm": 0.0,
  "now": {
    "condition": "晴",
    "temp": 16,
    "feels_like": 14,
    "wind_dir": "南风",
    "wind_scale": "2",
    "humidity": 30
  },
  "source": "和风天气（QWeather）"
}
```

## 数据（MySQL）

票务查询读取 Docker 里的 MySQL 8.0（`127.0.0.1:3306`，库 `travel_rag`）：

| 表 | 行数 | 用途 |
|---|---|---|
| `flight_tickets` | 60 | 机票（上海↔南京，2026-10-31 ~ 11-10） |
| `train_tickets` | 55 | 火车票（上海↔南京，2026-10-31 ~ 11-10） |
| `concert_tickets` | 49 | 演唱会（上海、南京，2026-10-31 ~ 11-07） |
| `car_rentals` | 46 | 租车（上海，2026-10-31 ~ 11-10，每天 3 款车型） |
| `insurances` | 13 | 旅游保险（4 类，保障期 7 / 14 天） |
| `chat_sessions` | 动态 | 会话列表（id / 标题 / 时间） |
| `short_term_messages` | 动态 | 会话消息（session_id + message_order） |
| `query_history` | 动态 | 每次工具调用记录（工具名 + 参数 JSON + 时间） |

Milvus `default/tour_groups`：21 条旅游团线路，`embedding` 1024 维，索引 IVF_FLAT / COSINE，检索结果按相似度返回 top-5。

演示数据脚本：`sql/insert_oct31_data.sql`（上海↔南京 机票/火车票、上海/南京 演唱会、租车、保险，`INSERT IGNORE` 可重复执行）。

## 文件

| 文件 | 职责 |
|---|---|
| `mcp_weather.py` | 天气 MCP（fastmcp，1 个工具，8101/mcp） |
| `mcp_ticket.py` | 票务 MCP（6 个工具，8102/mcp）：3 个查询走 MySQL，3 个预订为模拟 |
| `mcp_travel.py` | 旅游 MCP（6 个工具，8103/mcp）：租车/保险走 MySQL，旅游团走向量检索，3 个预订为模拟 |
| `agent_service.py` | 会话读写（MySQL）+ 上下文提示 + `create_agent` 调度 + `astream_events` 转 SSE 事件 |
| `web_service.py` | FastAPI：静态页面 + `/api/chat` + `/api/sessions` + `/api/health` |
| `static/index.html` / `style.css` / `app.js` | 明亮冰雪幻想游戏 HUD：三栏浅色玻璃面板、场景视差与双层粒子、SSE 流式 Markdown、13 工具调用时间线、真实天气卡与系统状态、历史会话；设计说明见 `docs/FRONTEND.md` |
| `static/bg.jpg` | 主题背景图（冰蓝二次元插画） |

## 工具接入（langchain.mcp）

Agent 侧只有一段循环：

```python
from langchain.mcp import MCPAdapter

for url in MCP_SERVERS.values():
    tools.extend(await MCPAdapter(f"{url}/mcp").list_tools())   # 共 13 个
```

`MCPAdapter` 负责：

1. 按标准 MCP 协议（streamable HTTP）连接服务，自动完成 initialize / tools/list；
2. 把每个 MCP 工具转换成带 JSON Schema 的异步 LangChain `StructuredTool`，可直接传给 `create_agent`；
3. 工具调用的错误以 `ToolMessage(status="error")` 回给模型，模型可自行纠正。

## 已知限制

- 天气、机票/火车票/演唱会查询、租车/保险查询、旅游团检索均为真实数据；所有预订接口仍是“已受理”模拟文案，不产生真实订单。
- 旅游团检索依赖 DashScope（embedding）与 Milvus；任一不可用时该工具返回错误 JSON，不影响其它工具。
- 和风天气的 `QWEATHER_HOST` / `QWEATHER_KEY` 从 `.env` 读取，缺失时天气工具返回明确的错误提示；`sql/init_tour_group_rag.py` 的 `DASHSCOPE_API_KEY` 同样读 `.env`。
- `langchain.mcp` 目前仍是 beta 命名空间，导入时会有一条 `LangChainBetaWarning`，不影响运行。
- 会话与消息持久化在 MySQL（`chat_sessions` / `short_term_messages`），服务重启不丢；每次只带最近 10 条进上下文，更早的消息仍可在侧边栏查看。
- MySQL 不可用时自动降级为「无记忆对话」，不影响正常问答。
- 仅监听 `127.0.0.1`，无鉴权，仅用于本机演示。
