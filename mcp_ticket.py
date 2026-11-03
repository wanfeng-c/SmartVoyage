"""票务 MCP 服务：机票 / 火车票 / 演唱会查询走 MySQL，预订仍为 print 模拟。

启动后 Agent 通过 langchain.mcp.MCPAdapter 连接 http://127.0.0.1:8102/mcp
"""

import datetime
import json
import os
import sys
from decimal import Decimal

import pymysql
from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv()  # 读取 .env 里的 MYSQL_* 配置

sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")  # 让 print 立即出现且中文不乱码

SERVER = "ticket-mcp"
PORT = 8102

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

mcp = FastMCP(SERVER, version="1.0.0", instructions="机票 / 火车票 / 演唱会票查询（MySQL 真实数据），预订为模拟")


def query(sql, params=()):
    """执行查询并返回 dict 列表。"""
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


def _json(rows):
    """把 datetime / Decimal 转成 JSON 可序列化类型，返回 {count, items}。"""
    for row in rows:
        for key, value in row.items():
            if isinstance(value, datetime.datetime):
                row[key] = value.strftime("%Y-%m-%d %H:%M")
            elif isinstance(value, Decimal):
                row[key] = float(value)
    return json.dumps({"count": len(rows), "items": rows}, ensure_ascii=False)


def _fail(message):
    return json.dumps({"error": message, "count": 0, "items": []}, ensure_ascii=False)


@mcp.tool
def search_flights(origin: str, destination: str, date: str) -> str:
    """按出发地、目的地、日期查询机票（MySQL 真实数据）。

    Args:
        origin: 出发城市，例如 上海
        destination: 到达城市，例如 南京
        date: 出发日期，支持 今天/明天/后天 或 2026-11-03
    """
    print(f"[{SERVER}] search_flights origin={origin} destination={destination} date={date}")
    try:
        rows = query(
            "SELECT flight_number, departure_city, arrival_city, departure_time, arrival_time, "
            "cabin_type, remaining_seats, price FROM flight_tickets "
            "WHERE departure_city=%s AND arrival_city=%s AND DATE(departure_time)=%s ORDER BY departure_time",
            (origin, destination, _date(date)),
        )
    except ValueError:
        return _fail(f"无法识别日期“{date}”，请使用 今天/明天/后天 或 2026-11-03 格式")
    except Exception as exc:
        return _fail(f"数据库查询失败：{exc}")
    return _json(rows)


@mcp.tool
def search_trains(origin: str, destination: str, date: str) -> str:
    """按出发地、目的地、日期查询火车票（MySQL 真实数据）。

    Args:
        origin: 出发城市，例如 上海
        destination: 到达城市，例如 南京
        date: 出发日期，支持 今天/明天/后天 或 2026-11-03
    """
    print(f"[{SERVER}] search_trains origin={origin} destination={destination} date={date}")
    try:
        rows = query(
            "SELECT train_number, departure_city, arrival_city, departure_time, arrival_time, "
            "seat_type, remaining_seats, price FROM train_tickets "
            "WHERE departure_city=%s AND arrival_city=%s AND DATE(departure_time)=%s ORDER BY departure_time",
            (origin, destination, _date(date)),
        )
    except ValueError:
        return _fail(f"无法识别日期“{date}”，请使用 今天/明天/后天 或 2026-11-03 格式")
    except Exception as exc:
        return _fail(f"数据库查询失败：{exc}")
    return _json(rows)


@mcp.tool
def search_concerts(city: str, date: str = "") -> str:
    """按城市查询演唱会门票（MySQL 真实数据），date 留空表示今天起的所有场次。

    Args:
        city: 城市名称，例如 上海、南京
        date: 演出日期，支持 今天/明天/后天 或 2026-11-03，留空查全部
    """
    print(f"[{SERVER}] search_concerts city={city} date={date}")
    sql = (
        "SELECT artist, city, venue, start_time, end_time, ticket_type, remaining_seats, price "
        "FROM concert_tickets WHERE city=%s "
    )
    try:
        if date and date.strip():
            rows = query(sql + "AND DATE(start_time)=%s ORDER BY start_time", (city, _date(date)))
        else:
            rows = query(sql + "AND start_time >= NOW() ORDER BY start_time", (city,))
    except ValueError:
        return _fail(f"无法识别日期“{date}”，请使用 今天/明天/后天 或 2026-11-03 格式")
    except Exception as exc:
        return _fail(f"数据库查询失败：{exc}")
    return _json(rows)


@mcp.tool
def book_flight(flight_no: str, passenger: str, id_card: str) -> str:
    """预订机票（模拟）。

    Args:
        flight_no: 航班号，例如 CA1234
        passenger: 乘机人姓名
        id_card: 乘机人证件号
    """
    print(f"[{SERVER}] book_flight flight_no={flight_no} passenger={passenger} id_card={id_card}")
    return f"已受理机票预订：航班 {flight_no}，乘机人 {passenger}，证件号 {id_card}。模拟订单已登记，未接入真实出票系统。"


@mcp.tool
def book_train(train_no: str, passenger: str, seat_type: str = "二等座") -> str:
    """预订火车票（模拟）。

    Args:
        train_no: 车次，例如 G1
        passenger: 乘客姓名
        seat_type: 席别，默认二等座
    """
    print(f"[{SERVER}] book_train train_no={train_no} passenger={passenger} seat_type={seat_type}")
    return f"已受理火车票预订：车次 {train_no}，乘客 {passenger}，席别 {seat_type}。模拟订单已登记，未接入真实出票系统。"


@mcp.tool
def book_concert(concert_name: str, ticket_type: str, quantity: int = 1) -> str:
    """预订演唱会门票（模拟）。

    Args:
        concert_name: 演唱会名称
        ticket_type: 票档，例如 内场、看台
        quantity: 数量，默认 1 张
    """
    print(f"[{SERVER}] book_concert concert_name={concert_name} ticket_type={ticket_type} quantity={quantity}")
    return f"已受理演唱会门票预订：{concert_name}，票档 {ticket_type}，数量 {quantity} 张。模拟订单已登记，未接入真实出票系统。"


if __name__ == "__main__":
    print(f"[{SERVER}] listening on http://127.0.0.1:{PORT}/mcp/")
    mcp.run(transport="http", host="127.0.0.1", port=PORT, show_banner=False)
