"""旅游 MCP 服务：租车 / 保险走 MySQL，旅游团走 Milvus 向量检索，预订仍为 print 模拟。

启动后 Agent 通过 langchain.mcp.MCPAdapter 连接 http://127.0.0.1:8103/mcp
"""

import datetime
import json
import os
import sys
from decimal import Decimal

import pymysql
import requests
from dotenv import load_dotenv
from fastmcp import FastMCP
from pymilvus import MilvusClient

load_dotenv()  # 读取 .env 里的 MYSQL_* / DASHSCOPE_API_KEY

sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")  # 让 print 立即出现且中文不乱码

SERVER = "travel-mcp"
PORT = 8103

DB = {
    "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "travel_rag"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
    "connect_timeout": 5,
}
MILVUS_URI = os.getenv("MILVUS_URI", "http://127.0.0.1:19530")
COLLECTION = os.getenv("MILVUS_COLLECTION", "tour_groups")
EMBED_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
EMBED_MODEL = "text-embedding-v3"
EMBED_KEY = os.getenv("DASHSCOPE_API_KEY", "")

mcp = FastMCP(SERVER, version="1.0.0", instructions="租车 / 旅游团 / 保险查询（MySQL + Milvus），预订为模拟")

_milvus = None


def query(sql, params=()):
    """执行 MySQL 查询并返回 dict 列表。"""
    with pymysql.connect(**DB) as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall()


def _date(text):
    """今天/明天/后天/大后天 或 YYYY-MM-DD → ISO 日期字符串。"""
    offsets = {"今天": 0, "今日": 0, "明天": 1, "明日": 1, "后天": 2, "大后天": 3}
    text = (text or "今天").strip()
    if text in offsets:
        return (datetime.date.today() + datetime.timedelta(days=offsets[text])).isoformat()
    return datetime.date.fromisoformat(text).isoformat()


def _json(rows, **extra):
    """把 datetime / Decimal 转成 JSON 可序列化类型，返回 {count, items, ...}。"""
    for row in rows:
        for key, value in row.items():
            if isinstance(value, datetime.datetime):
                row[key] = value.strftime("%Y-%m-%d %H:%M")
            elif isinstance(value, datetime.date):
                row[key] = value.isoformat()
            elif isinstance(value, Decimal):
                row[key] = float(value)
    return json.dumps({"count": len(rows), "items": rows, **extra}, ensure_ascii=False)


def _fail(message):
    return json.dumps({"error": message, "count": 0, "items": []}, ensure_ascii=False)


def _milvus_client():
    """懒加载 Milvus 客户端，Milvus 没起时不影响服务启动。"""
    global _milvus
    if _milvus is None:
        _milvus = MilvusClient(uri=MILVUS_URI)
    return _milvus


def _embed(text):
    """调用 DashScope 生成 1024 维查询向量。"""
    response = requests.post(
        EMBED_URL,
        headers={"Authorization": f"Bearer {EMBED_KEY}"},
        json={"model": EMBED_MODEL, "input": text, "dimensions": 1024},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()["data"][0]["embedding"]


@mcp.tool
def search_car_rental(city: str, pickup_date: str, days: int = 1) -> str:
    """按城市、取车日期查询租车（MySQL 真实数据）。

    Args:
        city: 取车城市，例如 上海
        pickup_date: 取车日期，支持 今天/明天/后天 或 2026-11-03
        days: 租期天数，默认 1 天，用于计算总价
    """
    print(f"[{SERVER}] search_car_rental city={city} pickup_date={pickup_date} days={days}")
    try:
        rows = query(
            "SELECT company, car_type, car_model, price_per_day, total_available, "
            "transmission, seats, deposit FROM car_rentals "
            "WHERE pickup_city=%s AND pickup_date=%s ORDER BY price_per_day",
            (city, _date(pickup_date)),
        )
    except ValueError:
        return _fail(f"无法识别日期“{pickup_date}”，请使用 今天/明天/后天 或 2026-11-03 格式")
    except Exception as exc:
        return _fail(f"数据库查询失败：{exc}")

    for row in rows:
        row["total_price"] = round(float(row["price_per_day"]) * days, 2)
    if not rows:
        return _json(rows, hint=f"{city} {pickup_date} 暂无可用车辆")
    return _json(rows)


@mcp.tool
def search_insurance(destination: str, days: int = 3) -> str:
    """按保障天数查询旅游保险（MySQL 真实数据）。

    Args:
        destination: 目的地，用于回显（保险表无目的地字段）
        days: 保障天数，默认 3 天，返回 duration_days >= days 的产品
    """
    print(f"[{SERVER}] search_insurance destination={destination} days={days}")
    try:
        rows = query(
            "SELECT insurance_type, name, company, coverage, price, duration_days, "
            "max_coverage, medical_coverage, baggage_coverage, flight_delay FROM insurances "
            "WHERE duration_days >= %s ORDER BY price LIMIT 10",
            (days,),
        )
    except Exception as exc:
        return _fail(f"数据库查询失败：{exc}")
    if not rows:
        return _json(rows, destination=destination, hint=f"没有保障 {days} 天及以上的保险产品")
    return _json(rows, destination=destination)


@mcp.tool
def search_tour_groups(destination: str, days: int = 3) -> str:
    """按目的地、天数语义检索旅游团线路（Milvus 向量检索）。

    Args:
        destination: 目的地，例如 云南、上海、日本
        days: 行程天数，默认 3 天
    """
    print(f"[{SERVER}] search_tour_groups destination={destination} days={days}")
    try:
        vector = _embed(f"{destination} {days}天 旅游团 行程亮点")
        hits = _milvus_client().search(
            collection_name=COLLECTION,
            data=[vector],
            limit=5,
            output_fields=[
                "tour_name", "city", "days", "price", "remaining_seats",
                "agency", "rating", "departure_dates", "highlights",
            ],
        )[0]
    except Exception as exc:
        return _fail(f"向量检索失败：{exc}")

    items = []
    for hit in hits:
        item = dict(hit["entity"])
        item["rating"] = round(float(item.get("rating", 0)), 2)
        item["similarity"] = round(float(hit["distance"]), 4)
        items.append(item)

    keyword = destination.strip()
    if items and not any(keyword in (item["tour_name"] + item["city"] + item["highlights"]) for item in items):
        return _json(items, note=f"未找到目的地包含「{destination}」的线路，以下为语义相近推荐")
    return _json(items)


@mcp.tool
def book_car_rental(car_model: str, pickup_date: str, days: int) -> str:
    """预订租车（模拟）。

    Args:
        car_model: 车型
        pickup_date: 取车日期
        days: 租期天数
    """
    print(f"[{SERVER}] book_car_rental car_model={car_model} pickup_date={pickup_date} days={days}")
    return f"已受理租车预订：车型 {car_model}，取车日期 {pickup_date}，租期 {days} 天。模拟订单已登记，未接入真实租车系统。"


@mcp.tool
def book_tour_group(group_name: str, people: int, depart_date: str) -> str:
    """预订旅游团（模拟）。

    Args:
        group_name: 旅游团名称
        people: 出行人数
        depart_date: 出发日期
    """
    print(f"[{SERVER}] book_tour_group group_name={group_name} people={people} depart_date={depart_date}")
    return f"已受理旅游团预订：{group_name}，人数 {people} 人，出发日期 {depart_date}。模拟订单已登记，未接入真实旅行社系统。"


@mcp.tool
def book_insurance(plan_name: str, people: int, days: int) -> str:
    """预订旅游保险（模拟）。

    Args:
        plan_name: 保险产品名称
        people: 投保人数
        days: 保障天数
    """
    print(f"[{SERVER}] book_insurance plan_name={plan_name} people={people} days={days}")
    return f"已受理旅游保险预订：{plan_name}，投保人数 {people} 人，保障天数 {days} 天。模拟订单已登记，未接入真实保险系统。"


if __name__ == "__main__":
    print(f"[{SERVER}] listening on http://127.0.0.1:{PORT}/mcp/")
    mcp.run(transport="http", host="127.0.0.1", port=PORT, show_banner=False)
