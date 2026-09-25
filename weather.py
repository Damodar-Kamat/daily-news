"""Today's weather from Open-Meteo (free, no API key). Fetched at build time, so the page never
has to call a third-party service itself."""
import json
import sys
from urllib.parse import urlencode

# WMO weather codes → (short label, emoji)
WMO = {
    0: ("Clear", "☀️"), 1: ("Mostly clear", "🌤️"), 2: ("Partly cloudy", "⛅"), 3: ("Cloudy", "☁️"),
    45: ("Fog", "🌫️"), 48: ("Fog", "🌫️"),
    51: ("Light drizzle", "🌦️"), 53: ("Drizzle", "🌦️"), 55: ("Heavy drizzle", "🌧️"),
    56: ("Freezing drizzle", "🌧️"), 57: ("Freezing drizzle", "🌧️"),
    61: ("Light rain", "🌦️"), 63: ("Rain", "🌧️"), 65: ("Heavy rain", "🌧️"),
    66: ("Freezing rain", "🌧️"), 67: ("Freezing rain", "🌧️"),
    71: ("Light snow", "🌨️"), 73: ("Snow", "🌨️"), 75: ("Heavy snow", "❄️"), 77: ("Snow grains", "🌨️"),
    80: ("Showers", "🌦️"), 81: ("Showers", "🌧️"), 82: ("Heavy showers", "⛈️"),
    85: ("Snow showers", "🌨️"), 86: ("Snow showers", "🌨️"),
    95: ("Thunderstorm", "⛈️"), 96: ("Thunderstorm, hail", "⛈️"), 99: ("Thunderstorm, hail", "⛈️"),
}


def describe(code, is_day=1):
    label, icon = WMO.get(int(code), ("—", "🌡️"))
    if not is_day and int(code) in (0, 1):
        icon = "🌙"
    return label, icon


def rain_alert(raw, now_local, threshold=60):
    """First hour later today (until 10 PM local time) with a rain chance >= threshold, e.g. {"hour": 16, "prob": 80}."""
    try:
        hours, probs = raw["hourly"]["time"], raw["hourly"]["precipitation_probability"]
        today, now_hour = now_local[:10], int(now_local[11:13])
        for t, p in zip(hours, probs):
            h = int(t[11:13])
            if t[:10] == today and now_hour <= h <= 22 and p is not None and p >= threshold:
                peak = max(pp for tt, pp in zip(hours, probs) if tt[:10] == today and h <= int(tt[11:13]) <= 22 and pp is not None)
                return {"hour": h, "prob": int(peak)}
    except (KeyError, ValueError, TypeError):
        pass
    return None


def fetch_weather(cfg, http_get):
    """Return a small dict for the page, or None if the lookup fails (the page then hides the strip)."""
    if not cfg:
        return None
    q = urlencode({
        "latitude": cfg["latitude"], "longitude": cfg["longitude"], "timezone": cfg.get("timezone", "auto"),
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "hourly": "precipitation_probability",
        "forecast_days": 3,
    })
    try:
        raw = json.loads(http_get("https://api.open-meteo.com/v1/forecast?" + q, timeout=15))
        cur, day = raw["current"], raw["daily"]
        label, icon = describe(cur["weather_code"], cur.get("is_day", 1))
        days = []
        for i, date in enumerate(day["time"]):
            dl, di = describe(day["weather_code"][i])
            days.append({
                "date": date, "label": dl, "icon": di,
                "max": round(day["temperature_2m_max"][i]), "min": round(day["temperature_2m_min"][i]),
                "rain": day["precipitation_probability_max"][i],
            })
        return {
            "alert": rain_alert(raw, cur["time"]),
            "city": cfg["city"],
            "temp": round(cur["temperature_2m"]), "feels": round(cur["apparent_temperature"]),
            "humidity": cur["relative_humidity_2m"], "label": label, "icon": icon,
            "observed": cur["time"], "days": days,
        }
    except Exception as e:  # noqa: BLE001 - weather is optional
        print(f"weather: skipped ({str(e)[:80]})", file=sys.stderr)
        return None
