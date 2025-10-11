import os


# Path to your SQLite database file. Place db.sqlite in project root by default.
DB_PATH = os.getenv("WEB_CAN_DB", os.path.join(os.path.dirname(os.path.dirname(__file__)), "db.sqlite"))


# Table and column mappings aligned to your schema screenshot
# manufacturers(manufacturerId, manufacturerName)
# carsModels(carModelId, carModelName, manufacturerId)
# canParameters(canParameterId, canParameterName_ru, ...)
TABLES = {
    "manufacturers": {
        "table": os.getenv("WEB_CAN_TBL_MANUFACTURERS", "manufacturers"),
        "id": os.getenv("WEB_CAN_COL_MANUFACTURER_ID", "manufacturerId"),
        "name": os.getenv("WEB_CAN_COL_MANUFACTURER_NAME", "manufacturerName"),
    },
    "models": {
        "table": os.getenv("WEB_CAN_TBL_MODELS", "carsModels"),
        "id": os.getenv("WEB_CAN_COL_MODEL_ID", "carModelId"),
        "name": os.getenv("WEB_CAN_COL_MODEL_NAME", "carModelName"),
        "manufacturer_id": os.getenv("WEB_CAN_COL_MODEL_MANUFACTURER_ID", "manufacturerId"),
    },
    "parameters": {
        "table": os.getenv("WEB_CAN_TBL_PARAMS", "canParameters"),
        "id": os.getenv("WEB_CAN_COL_PARAM_ID", "canParameterId"),
        # Use Russian names for autocomplete (e.g., "Обороты двигателя")
        "name": os.getenv("WEB_CAN_COL_PARAM_NAME", "canParameterName_ru"),
    },
    "submissions": {
        "table": os.getenv("WEB_CAN_TBL_SUBMISSIONS", "submissions"),
    },
}


def ensure_submission_table_sql(table_name: str) -> str:
    return f"""
    CREATE TABLE IF NOT EXISTS {table_name} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL,
        parameter_id INTEGER NOT NULL,
        can_id TEXT NOT NULL,
        multiplier REAL,
        offset REAL,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """
