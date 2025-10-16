import os
import sqlite3
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .config import DB_PATH, TABLES, ensure_submission_table_sql


class DB:
    def __init__(self, path: Optional[str] = None):
        self.path = path or DB_PATH

    def available(self) -> bool:
        return os.path.exists(self.path)

    def connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        return con

    def query(self, sql: str, params: Iterable[Any] = ()) -> List[sqlite3.Row]:
        with self.connect() as con:
            cur = con.execute(sql, tuple(params))
            return cur.fetchall()

    def execute(self, sql: str, params: Iterable[Any] = ()) -> int:
        with self.connect() as con:
            cur = con.execute(sql, tuple(params))
            con.commit()
            return cur.lastrowid

    def ensure_submissions_table(self) -> None:
        table = TABLES["submissions"]["table"]
        sql = ensure_submission_table_sql(table)
        with self.connect() as con:
            con.executescript(sql)

            # Migration: ensure `parameter_name` exists and `parameter_id` is nullable
            info = con.execute(f"PRAGMA table_info({table})").fetchall()
            cols = {row[1]: row for row in info}  # name -> row
            required_cols = {"parameter_name", "byte_indices", "bit_indices", "formula", "endian", "bus_type_id", "can_bus_id", "offset_bits", "length_bits", "dimension_id", "is29bit"}
            missing_required = any(c not in cols for c in required_cols)
            param_id_notnull = bool(cols.get("parameter_id", (None, None, None, 0))[3]) if cols.get("parameter_id") else False
            vehicle_id_notnull = bool(cols.get("vehicle_id", (None, None, None, 0))[3]) if cols.get("vehicle_id") else False

            if missing_required or param_id_notnull or vehicle_id_notnull:
                con.execute("BEGIN TRANSACTION")
                con.execute(
                    f"""
                    CREATE TABLE {table}_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        vehicle_id INTEGER,
                        parameter_id INTEGER,
                        parameter_name TEXT,
                        byte_indices TEXT,
                        bit_indices TEXT,
                        can_id TEXT NOT NULL,
                        formula TEXT,
                        endian TEXT,
                        bus_type_id INTEGER,
                        can_bus_id INTEGER,
                        offset_bits INTEGER,
                        length_bits INTEGER,
                        dimension_id INTEGER,
                        is29bit INTEGER,
                        notes TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    );
                    """
                )
                # Copy data; parameter_name will be NULL
                existing_cols = [c for c in [
                    "id","vehicle_id","parameter_id","parameter_name","byte_indices","bit_indices","can_id","formula","endian","bus_type_id","can_bus_id","offset_bits","length_bits","dimension_id","is29bit","notes","created_at"
                ] if c in cols]
                col_list = ",".join(existing_cols)
                con.execute(
                    f"INSERT INTO {table}_new ({col_list}) SELECT {col_list} FROM {table}"
                )
                con.execute(f"DROP TABLE {table}")
                con.execute(f"ALTER TABLE {table}_new RENAME TO {table}")
                con.execute("COMMIT")


db = DB()


def get_makes() -> List[str]:
    mt = TABLES["manufacturers"]
    sql = (
        f"SELECT DISTINCT {mt['name']} AS make FROM {mt['table']} "
        f"WHERE {mt['name']} IS NOT NULL AND TRIM({mt['name']}) <> '' "
        f"ORDER BY {mt['name']}"
    )
    rows = db.query(sql)
    return [r["make"] for r in rows]


def get_models(make: str) -> List[str]:
    mt = TABLES["manufacturers"]
    mdl = TABLES["models"]
    sql = (
        f"SELECT DISTINCT m.{mdl['name']} AS model "
        f"FROM {mdl['table']} m "
        f"JOIN {mt['table']} mf ON m.{mdl['manufacturer_id']} = mf.{mt['id']} "
        f"WHERE mf.{mt['name']} = ? AND m.{mdl['name']} IS NOT NULL AND TRIM(m.{mdl['name']}) <> '' "
        f"ORDER BY m.{mdl['name']}"
    )
    rows = db.query(sql, (make,))
    return [r["model"] for r in rows]


def get_generations(make: str, model: str) -> List[Dict[str, Any]]:
    mt = TABLES["manufacturers"]
    mdl = TABLES["models"]
    gen = TABLES["generations"]
    sql = (
        f"SELECT g.{gen['id']} AS id, g.{gen['name']} AS name, "
        f"g.{gen['major']} AS major, g.{gen['minor']} AS minor "
        f"FROM {gen['table']} g "
        f"JOIN {mdl['table']} m ON g.{gen['model_id']} = m.{mdl['id']} "
        f"JOIN {mt['table']} mf ON m.{mdl['manufacturer_id']} = mf.{mt['id']} "
        f"WHERE mf.{mt['name']} = ? AND m.{mdl['name']} = ? "
        f"ORDER BY g.{gen['name']}, g.{gen['major']}, g.{gen['minor']}"
    )
    rows = db.query(sql, (make, model))
    result: List[Dict[str, Any]] = []
    for r in rows:
        label_parts = [r["name"]] if r["name"] else []
        if r["major"] is not None and r["minor"] is not None:
            label_parts.append(f"v{r['major']}.{r['minor']}")
        result.append({"id": r["id"], "label": " ".join(label_parts) or str(r["id"])})
    return result


def get_vehicles(make: Optional[str] = None, model: Optional[str] = None) -> List[Dict[str, Any]]:
    mt = TABLES["manufacturers"]
    mdl = TABLES["models"]
    cols = (
        f"m.{mdl['id']} AS id, mf.{mt['name']} AS make, m.{mdl['name']} AS model"
    )
    sql = (
        f"SELECT {cols} "
        f"FROM {mdl['table']} m "
        f"JOIN {mt['table']} mf ON m.{mdl['manufacturer_id']} = mf.{mt['id']}"
    )
    params: List[Any] = []
    where: List[str] = []
    if make:
        where.append(f"mf.{mt['name']} = ?")
        params.append(make)
    if model:
        where.append(f"m.{mdl['name']} = ?")
        params.append(model)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY mf.{mt['name']}, m.{mdl['name']}"
    rows = db.query(sql, params)
    return [dict(r) for r in rows]


def get_parameters(query: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    pt = TABLES["parameters"]
    cols = f"{pt['id']} AS id, {pt['name']} AS name"
    sql = f"SELECT {cols} FROM {pt['table']}"
    params: List[Any] = []
    where = [f"{pt['name']} IS NOT NULL", f"TRIM({pt['name']}) <> ''"]
    if query:
        where.append(f"{pt['name']} LIKE ?")
        params.append(f"%{query}%")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {pt['name']} LIMIT ?"
    params.append(limit)
    rows = db.query(sql, params)
    return [dict(r) for r in rows]


def get_parameter_by_name(name: str) -> Optional[int]:
    pt = TABLES["parameters"]
    sql = f"SELECT {pt['id']} AS id FROM {pt['table']} WHERE {pt['name']} = ? LIMIT 1"
    rows = db.query(sql, (name,))
    return int(rows[0]["id"]) if rows else None


def ensure_parameter(name: str) -> int:
    """Return parameter id by name, creating it if absent."""
    existing = get_parameter_by_name(name)
    if existing is not None:
        return existing
    pt = TABLES["parameters"]
    # Insert only the name column; other columns default/null
    insert_sql = f"INSERT INTO {pt['table']} ({pt['name']}) VALUES (?)"
    return db.execute(insert_sql, (name,))


def parameter_exists_in_generation(generation_id: int, parameter_id: int) -> bool:
    # canData(generationId, canParameterId, ...)
    sql = (
        "SELECT 1 FROM canData WHERE generationId = ? AND canParameterId = ? LIMIT 1"
    )
    rows = db.query(sql, (generation_id, parameter_id))
    return len(rows) > 0


def get_generation_parameters(generation_id: int) -> List[Dict[str, Any]]:
    pt = TABLES["parameters"]
    sql = (
        f"SELECT p.{pt['id']} AS id, p.{pt['name']} AS name, COUNT(*) AS entries "
        f"FROM canData d JOIN {pt['table']} p ON d.canParameterId = p.{pt['id']} "
        f"WHERE d.generationId = ? "
        f"GROUP BY p.{pt['id']}, p.{pt['name']} "
        f"ORDER BY p.{pt['name']}"
    )
    rows = db.query(sql, (generation_id,))
    return [dict(r) for r in rows]


def insert_submission(
    vehicle_id: Optional[int],
    parameter_id: Optional[int],
    parameter_name: Optional[str],
    can_id: str,
    formula: Optional[str],
    endian: Optional[str],
    notes: Optional[str],
    byte_indices: Optional[List[int]] = None,
    bit_indices: Optional[List[int]] = None,
    bus_type_id: Optional[int] = None,
    can_bus_id: Optional[int] = None,
    offset_bits: Optional[int] = None,
    length_bits: Optional[int] = None,
    dimension_id: Optional[int] = None,
    is29bit: Optional[int] = None,
) -> int:
    st = TABLES["submissions"]["table"]
    sql = f"""
        INSERT INTO {st} (vehicle_id, parameter_id, parameter_name, can_id, formula, endian, notes, byte_indices, bit_indices, bus_type_id, can_bus_id, offset_bits, length_bits, dimension_id, is29bit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    import json
    return db.execute(sql, (
        vehicle_id, parameter_id, parameter_name, can_id, formula, endian, notes,
        json.dumps(byte_indices or []), json.dumps(bit_indices or []),
        bus_type_id, can_bus_id, offset_bits, length_bits, dimension_id, is29bit,
    ))


def get_bus_types() -> List[Dict[str, Any]]:
    rows = db.query("SELECT idBus AS id, busName AS name FROM busType ORDER BY id")
    return [dict(r) for r in rows]


def get_can_buses() -> List[Dict[str, Any]]:
    rows = db.query("SELECT canBusId AS id, canBusName AS name, canBaudrate AS baudrate FROM canBuses ORDER BY canBaudrate")
    return [dict(r) for r in rows]


def get_dimensions() -> List[Dict[str, Any]]:
    # Not all DBs have a 'priority' column; order by name safely
    rows = db.query(
        "SELECT id, COALESCE(dimension_ru, dimension_en) AS name FROM dimensions ORDER BY name"
    )
    return [dict(r) for r in rows]
