"""天气 MCP 服务：通过和风天气 API 查询真实天气，返回 JSON 数据（FastMCP 4，streamable HTTP）。

启动后 Agent 通过 langchain.mcp.MCPAdapter 连接 http://127.0.0.1:8101/mcp
"""

import datetime
import json
import os
import sys

import requests
from dotenv import load_dotenv
from fastmcp import FastMCP

sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")  # 让 print 立即出现且中文不乱码

load_dotenv()  # 读取 .env 里的 QWEATHER_HOST / QWEATHER_KEY

SERVER = "weather-mcp"
PORT = 8101
QWEATHER_HOST = os.getenv("QWEATHER_HOST", "")
QWEATHER_KEY = os.getenv("QWEATHER_KEY", "")

mcp = FastMCP(SERVER, version="1.0.0", instructions="和风天气实时天气查询服务，返回 JSON 数据")


def _api(path, **params):
    """调用和风天气接口并返回 JSON，错误统一转成中文异常。"""
    if not QWEATHER_HOST or not QWEATHER_KEY:
        raise RuntimeError("未配置和风天气：请在 .env 中填写 QWEATHER_HOST 与 QWEATHER_KEY")
    params["key"] = QWEATHER_KEY
    data = requests.get(f"https://{QWEATHER_HOST}{path}", params=params, timeout=10).json()
    error = data.get("error")
    if error:
        status, kind = error.get("status"), error.get("type", "")
        if "no-such-location" in kind:
            raise RuntimeError("没有找到该城市，请检查城市名称")
        if "data-not-available" in kind:
            raise RuntimeError("该城市暂无可用的天气数据，请换个城市试试")
        raise RuntimeError({401: "和风天气 API Key 或 Host 无效", 403: "和风天气账号无权限或已超限"}.get(status, f"和风天气请求失败（{status}）"))
    if data.get("code") != "200":
        raise RuntimeError(f"和风天气返回错误码 {data.get('code')}")
    return data


def _target_date(text):
    """今天/明天/后天/大后天 或 YYYY-MM-DD → datetime.date。"""
    offsets = {"今天": 0, "今日": 0, "明天": 1, "明日": 1, "后天": 2, "大后天": 3}
    text = (text or "今天").strip()
    if text in offsets:
        return datetime.date.today() + datetime.timedelta(days=offsets[text])
    return datetime.date.fromisoformat(text)


def _number(value, cast):
    """把接口里的字符串数字转成 int/float，转换失败保留原值。"""
    try:
        return cast(value)
    except (TypeError, ValueError):
        return value


@mcp.tool
def get_weather(city: str, date: str = "今天") -> str:
    """查询指定城市的真实天气（和风天气），返回 JSON 字符串。

    Args:
        city: 城市名称，例如 北京、上海市、Beijing
        date: 日期，支持 今天/明天/后天/大后天 或 2026-11-05，默认今天
    """
    print(f"[{SERVER}] get_weather city={city} date={date}")
    today = datetime.date.today()

    def fail(message):
        return json.dumps({"error": message, "city": city, "date": date}, ensure_ascii=False)

    try:
        target = _target_date(date)
    except ValueError:
        return fail(f"无法识别日期“{date}”，请使用 今天/明天/后天/大后天 或 2026-11-05 格式")
    if target < today:
        return fail("只能查询今天及以后 7 天内的天气")
    if (target - today).days > 6:
        return fail("和风天气支持未来 7 天预报，请把日期换到 7 天以内")

    try:
        place = _api("/geo/v2/city/lookup", location=city, number=1)["location"][0]
        daily = _api("/v7/weather/7d", location=place["id"])["daily"]
    except requests.RequestException:
        return fail("天气服务暂时不可用（网络异常），请稍后再试")
    except (RuntimeError, KeyError, IndexError) as exc:
        return fail(f"天气查询失败：{exc}")

    day = next((item for item in daily if item["fxDate"] == target.isoformat()), None)
    if day is None:
        return fail(f"没有查到 {place.get('name', city)} {target} 的预报数据")

    result = {
        "city": place.get("name", city),
        "province": place.get("adm1", ""),
        "date": target.isoformat(),
        "condition": day["textDay"],
        "temp_min": _number(day["tempMin"], int),
        "temp_max": _number(day["tempMax"], int),
        "wind_dir": day["windDirDay"],
        "wind_scale": day["windScaleDay"],
        "humidity": _number(day["humidity"], int),
        "precip_mm": _number(day["precip"], float),
        "source": "和风天气（QWeather）",
    }
    if target == today:  # 当天额外附上实况
        try:
            now = _api("/v7/weather/now", location=place["id"])["now"]
            result["now"] = {
                "condition": now["text"],
                "temp": _number(now["temp"], int),
                "feels_like": _number(now["feelsLike"], int),
                "wind_dir": now["windDir"],
                "wind_scale": now["windScale"],
                "humidity": _number(now["humidity"], int),
            }
        except (requests.RequestException, RuntimeError, KeyError):
            pass  # 实况失败不影响预报结果
    return json.dumps(result, ensure_ascii=False)


if __name__ == "__main__":
    print(f"[{SERVER}] listening on http://127.0.0.1:{PORT}/mcp/")
    mcp.run(transport="http", host="127.0.0.1", port=PORT, show_banner=False)
