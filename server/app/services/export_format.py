from __future__ import annotations

from datetime import datetime, timedelta, timezone


EXPORT_TIMEZONE = timezone(timedelta(hours=8))


def parse_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def as_utc_datetime(value: object) -> datetime | None:
    dt = parse_datetime(value)
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def format_api_datetime(value: object) -> str:
    """Return an ISO timestamp with explicit UTC timezone for API responses."""
    dt = as_utc_datetime(value)
    if dt is None:
        return ""
    return dt.isoformat().replace("+00:00", "Z")


def format_local_datetime(value: object) -> str:
    """Format user-facing datetime values as Asia/Shanghai seconds."""
    if value is None:
        return ""
    raw_text = "" if isinstance(value, datetime) else str(value).strip()
    dt = parse_datetime(value)
    if dt is None:
        return raw_text
    if isinstance(value, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if dt.tzinfo is None and "T" in raw_text:
        dt = dt.replace(tzinfo=timezone.utc)
    if dt.tzinfo is not None:
        dt = dt.astimezone(EXPORT_TIMEZONE).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def format_export_datetime(value: object) -> str:
    """Format API datetime values for exported files."""
    return format_local_datetime(value)


def current_export_datetime() -> str:
    return format_local_datetime(datetime.now(timezone.utc))
