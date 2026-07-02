from datetime import datetime


def model_to_dict(obj) -> dict:
    """Convert SQLAlchemy model instance to dict with camelCase keys."""
    result = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        elif hasattr(value, "hex"):
            value = str(value)
        # Convert snake_case to camelCase
        camel = "".join(
            word.capitalize() if i > 0 else word
            for i, word in enumerate(column.name.split("_"))
        )
        result[camel] = value
    return result
