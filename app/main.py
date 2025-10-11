from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import db, get_makes, get_models, get_parameters, get_vehicles, insert_submission, get_generations, parameter_exists_in_generation, get_parameter_by_name
from .config import DB_PATH


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


@app.get("/api/parameters")
def api_parameters(query: Optional[str] = None, limit: int = 200) -> JSONResponse:
    require_db()
    return JSONResponse(get_parameters(query, limit))


@app.post("/api/submissions")
def api_submit(payload: dict) -> JSONResponse:
    require_db()
    required = ["vehicle_id", "can_id"]
    missing = [k for k in required if k not in payload or payload[k] in (None, "")]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

    try:
        gen_id = int(payload["vehicle_id"])  # here vehicle_id represents generationId
        param_id = int(payload["parameter_id"]) if payload.get("parameter_id") not in (None, "") else None
        param_name = str(payload.get("parameter_name")).strip() if payload.get("parameter_name") else None

        if param_id is None and not param_name:
            raise HTTPException(status_code=400, detail="Нужно выбрать параметр из списка или указать название вручную.")

        # If only name provided, try to resolve to an existing id
        if param_id is None and param_name:
            resolved_id = get_parameter_by_name(param_name)
            if resolved_id is not None:
                param_id = resolved_id

        # Block duplicates if parameter already exists for the generation in canData
        if param_id is not None and parameter_exists_in_generation(gen_id, param_id):
            raise HTTPException(status_code=409, detail="Этот параметр уже присутствует для выбранного поколения в БД (canData).")

        # Parse bit/byte selections
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

        bytes_sel = parse_int_list(payload.get("selected_bytes"))
        bits_sel = parse_int_list(payload.get("selected_bits"))

        # Endianness and formula
        endian = payload.get("endian")
        if endian is not None:
            endian = str(endian).lower().strip()
            if endian not in ("little", "big"):
                raise HTTPException(status_code=400, detail="Неверное значение 'endian'. Допустимо: little или big.")
        else:
            raise HTTPException(status_code=400, detail="Укажите направление чтения: little-endian или big-endian.")
        formula = str(payload.get("formula")).strip() if payload.get("formula") else None

        new_id = insert_submission(
            gen_id,
            param_id,
            param_name if param_id is None else None,
            str(payload["can_id"]).strip(),
            formula,
            endian,
            str(payload.get("notes")).strip() if payload.get("notes") not in (None,) else None,
            byte_indices=bytes_sel,
            bit_indices=bits_sel,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Insert failed: {e}")

    return JSONResponse({"id": new_id, "status": "ok"}, status_code=201)


@app.get("/api/health")
def api_health() -> JSONResponse:
    return JSONResponse({
        "db_path": DB_PATH,
        "db_exists": db.available(),
        "status": "ok" if db.available() else "no_db",
    })
