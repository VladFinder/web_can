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


def insert_submission(vehicle_id: int, parameter_id: int, can_id: str, multiplier: Optional[float], offset: Optional[float], notes: Optional[str]) -> int:
    st = TABLES["submissions"]["table"]
    sql = f"""
        INSERT INTO {st} (vehicle_id, parameter_id, can_id, multiplier, offset, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """
    return db.execute(sql, (vehicle_id, parameter_id, can_id, multiplier, offset, notes))
