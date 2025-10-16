from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import db, get_makes, get_models, get_parameters, get_vehicles, insert_submission, get_generations, parameter_exists_in_generation, get_parameter_by_name, get_generation_parameters, get_bus_types, get_can_buses, get_dimensions
from .config import DB_PATH, EXPORT_DIR
import os
import re
import json
from datetime import datetime


app = FastAPI(title="Web CAN Submission App")

# Allow same-origin and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    if db.available():
        db.ensure_submissions_table()


@app.get("/")
def index() -> FileResponse:
    return FileResponse("static/index.html")


# Static assets
app.mount("/static", StaticFiles(directory="static"), name="static")


def require_db():
    if not db.available():
        raise HTTPException(
            status_code=503,
            detail=f"Database not found at: {DB_PATH}. Place db.sqlite in project root or set WEB_CAN_DB to the full path.",
        )


@app.get("/api/makes")
def api_makes() -> JSONResponse:
    require_db()
    return JSONResponse(get_makes())


@app.get("/api/models")
def api_models(make: str = Query(...)) -> JSONResponse:
    require_db()
    return JSONResponse(get_models(make))


@app.get("/api/vehicles")
def api_vehicles(make: Optional[str] = None, model: Optional[str] = None) -> JSONResponse:
    require_db()
    return JSONResponse(get_vehicles(make, model))


@app.get("/api/generations")
def api_generations(make: str = Query(...), model: str = Query(...)) -> JSONResponse:
    require_db()
    return JSONResponse(get_generations(make, model))


@app.get("/api/generation-parameters")
def api_generation_parameters(generation_id: int = Query(...)) -> JSONResponse:
    require_db()
    try:
        gid = int(generation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="generation_id должно быть числом")
    return JSONResponse(get_generation_parameters(gid))


@app.get("/api/bus-types")
def api_bus_types() -> JSONResponse:
    require_db()
    return JSONResponse(get_bus_types())


@app.get("/api/can-buses")
def api_can_buses() -> JSONResponse:
    require_db()
    return JSONResponse(get_can_buses())


@app.get("/api/dimensions")
def api_dimensions() -> JSONResponse:
    require_db()
    return JSONResponse(get_dimensions())


@app.get("/api/parameters")
def api_parameters(query: Optional[str] = None, limit: int = 200) -> JSONResponse:
    require_db()
    return JSONResponse(get_parameters(query, limit))


@app.post("/api/submissions")
def api_submit(payload: dict) -> JSONResponse:
    require_db()
    def parse_int_list(val):
        if isinstance(val, list):
            out = []
            for x in val:
                try:
                    out.append(int(x))
                except Exception:
                    continue
            return out
        return []

    def process_one(item: dict, gen_id_opt: Optional[int]) -> int:
        param_id = int(item["parameter_id"]) if item.get("parameter_id") not in (None, "") else None
        param_name = str(item.get("parameter_name")).strip() if item.get("parameter_name") else None
        if param_id is None and not param_name:
            raise HTTPException(status_code=400, detail="Нужно выбрать параметр из списка или указать название вручную.")
        if param_id is None and param_name:
            resolved_id = get_parameter_by_name(param_name)
            if resolved_id is not None:
                param_id = resolved_id
        # Duplicate check only if есть generation и param_id
        if gen_id_opt is not None and param_id is not None and parameter_exists_in_generation(gen_id_opt, param_id):
            raise HTTPException(status_code=409, detail="Этот параметр уже присутствует для выбранного поколения в БД (canData).")

        bytes_sel = parse_int_list(item.get("selected_bytes"))
        bits_sel = parse_int_list(item.get("selected_bits"))

        endian = item.get("endian")
        if endian is not None:
            endian = str(endian).lower().strip()
            if endian not in ("little", "big"):
                raise HTTPException(status_code=400, detail="Неверное значение 'endian'. Допустимо: little или big.")
        else:
            raise HTTPException(status_code=400, detail="Укажите направление чтения: little-endian или big-endian.")
        formula = str(item.get("formula")).strip() if item.get("formula") else None

        return insert_submission(
            gen_id_opt if gen_id_opt is not None else None,
            param_id,
            param_name if param_id is None else None,
            str(item["can_id"]).strip(),
            formula,
            endian,
            str(item.get("notes")).strip() if item.get("notes") not in (None,) else None,
            byte_indices=bytes_sel,
            bit_indices=bits_sel,
            bus_type_id=int(item.get("bus_type_id")) if item.get("bus_type_id") not in (None, "") else None,
            can_bus_id=int(item.get("can_bus_id")) if item.get("can_bus_id") not in (None, "") else None,
            offset_bits=int(item.get("offset_bits")) if item.get("offset_bits") not in (None, "") else None,
            length_bits=int(item.get("length_bits")) if item.get("length_bits") not in (None, "") else None,
            dimension_id=int(item.get("dimension_id")) if item.get("dimension_id") not in (None, "") else None,
            is29bit=1 if str(item.get("is29bit")).lower() in ("1","true","yes","on") else 0,
        )

    # Either batch of items or single legacy payload
    items = payload.get("items")
    saved_ids: list[int] = []
    try:
        gen_id = None
        if payload.get("vehicle_id") not in (None, ""):
            try:
                gen_id = int(payload["vehicle_id"])  # can be None for custom
            except Exception:
                gen_id = None

        if items and isinstance(items, list):
            for it in items:
                saved_ids.append(process_one(it, gen_id))
        else:
            saved_ids.append(process_one(payload, gen_id))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Insert failed: {e}")

    # Save JSON snapshot to filesystem (single or multi)
    try:
        now = datetime.now()
        y = f"{now.year:04d}"
        m = f"{now.month:02d}"
        d = f"{now.day:02d}"
        base_dir = os.path.join(EXPORT_DIR, y, m, d)
        os.makedirs(base_dir, exist_ok=True)

        existing = [f for f in os.listdir(base_dir) if f.lower().endswith('.json')]
        def parse_idx(name: str) -> int:
            try:
                return int(re.match(r"^(\d+)_", name).group(1))
            except Exception:
                return 0
        next_idx = (max([parse_idx(n) for n in existing] + [0]) + 1)
        idx_str = f"{next_idx:03d}"

        file_label = "MULTI"
        if items and len(items) > 0:
            can_for_name = str(items[0].get("can_id", "")).strip()
        else:
            can_for_name = str(payload.get("can_id", "")).strip()
        if can_for_name:
            file_label = re.sub(r"[^0-9A-Za-zx]+", "-", can_for_name)

        filename = f"{idx_str}_{file_label}.json" if (not items or len(items)==1) else f"{idx_str}_MULTI.json"
        out_path = os.path.join(base_dir, filename)

        snapshot = {
            "db_submission_ids": saved_ids,
            "count": len(saved_ids),
            "timestamp": now.isoformat(),
            "make": payload.get("make") or payload.get("make_custom"),
            "model": payload.get("model") or payload.get("model_custom"),
            "generation_label": payload.get("generation_label") or payload.get("generation_custom"),
            "generation_id": gen_id,
            "items": items if items else [payload],
        }
        # If generation is custom (no id) — include full parameter catalog for future use
        if gen_id is None:
            snapshot["all_parameters"] = get_parameters(None, 10000)

        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)

        # Also generate SQL script for DB insertion
        sql_lines: list[str] = []
        sql_lines.append("BEGIN TRANSACTION;")
        # If no generation id, generate inserts for manufacturer/model/generation
        if gen_id is None:
            make = (payload.get("make") or payload.get("make_custom") or "").replace("'", "''")
            model = (payload.get("model") or payload.get("model_custom") or "").replace("'", "''")
            gen_label = (payload.get("generation_label") or payload.get("generation_custom") or "").replace("'", "''")
            sql_lines.append(f"INSERT INTO manufacturers(manufacturerName) VALUES ('{make}');")
            sql_lines.append("-- manufacturerId = last_insert_rowid()")
            sql_lines.append(f"INSERT INTO carsModels(carModelName, manufacturerId) VALUES ('{model}', last_insert_rowid());")
            sql_lines.append("-- carModelId = last_insert_rowid()")
            sql_lines.append(f"INSERT INTO generations(generationName, carModelId, MajorVersion, MinorVersion) VALUES ('{gen_label}', last_insert_rowid(), 0, 0);")
            sql_lines.append("-- generationId = last_insert_rowid()")
            sql_lines.append("WITH g(id) AS (SELECT last_insert_rowid()) SELECT * FROM g;")
        else:
            sql_lines.append(f"-- Using existing generationId = {gen_id}")

        # Insert parameters into canData (create canParameters if needed)
        def sql_escape(s: Optional[str]) -> str:
            return (s or "").replace("'", "''")

        src_items = items if items else [payload]
        for it in src_items:
            p_id = it.get("parameter_id")
            p_name = it.get("parameter_name")
            if not p_id and p_name:
                sql_lines.append(f"INSERT INTO canParameters(canParameterName_ru) VALUES ('{sql_escape(p_name)}');")
                sql_lines.append("-- canParameterId = last_insert_rowid()")
                p_ref = "last_insert_rowid()"
            else:
                p_ref = str(p_id)

            dim_id = it.get("dimension_id")
            dim_expr = str(int(dim_id)) if dim_id not in (None, "") else "NULL"
            can_bus_id = it.get("can_bus_id")
            bus_type_id = it.get("bus_type_id")
            # Off/len should be NULL per requirement
            formula = sql_escape(it.get("formula"))
            # PID and mask
            def parse_can_id(s: str) -> int:
                ss = (s or "").strip()
                if ss.lower().startswith("0x"): return int(ss, 16)
                return int(ss or 0)
            cid = parse_can_id(it.get("can_id", "0"))
            is29 = str(it.get("is29bit")).lower() in ("1","true","yes","on")
            pid_mask = 0x1FFFFFFF if is29 else 0x7FF
            def to_blob_hex(n: int, size: int = 4) -> str:
                h = n.to_bytes(size, 'big').hex().upper()
                return f"X'{h}'"
            pid_hex = to_blob_hex(cid, 4)
            mask_hex = to_blob_hex(pid_mask, 4)

            sql_lines.append(
                "INSERT INTO canData (pid, pidMask, is29Bit, formula, canBusId, canParameterId, generationId, busType, deprecated, conditionOffset, conditionLength, dimension) "
                f"VALUES ({pid_hex}, {mask_hex}, {1 if is29 else 0}, '{formula}', {int(can_bus_id) if can_bus_id else 'NULL'}, {p_ref}, "
                + ("last_insert_rowid()" if gen_id is None else str(gen_id))
                + f", {int(bus_type_id) if bus_type_id is not None else 'NULL'}, 0, NULL, NULL, {dim_expr});"
            )

        sql_lines.append("COMMIT;")
        sql_path = out_path[:-5] + "_insert.sql"
        with open(sql_path, 'w', encoding='utf-8') as sf:
            sf.write("\n".join(sql_lines))
    except Exception as e:
        return JSONResponse({
            "saved": len(saved_ids),
            "status": "ok",
            "file_saved": False,
            "error": str(e),
        }, status_code=201)

    return JSONResponse({"saved": len(saved_ids), "status": "ok", "file_saved": True}, status_code=201)


@app.get("/api/health")
def api_health() -> JSONResponse:
    return JSONResponse({
        "db_path": DB_PATH,
        "db_exists": db.available(),
        "status": "ok" if db.available() else "no_db",
    })
