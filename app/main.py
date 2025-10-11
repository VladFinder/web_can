from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import db, get_makes, get_models, get_parameters, get_vehicles, insert_submission
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


@app.get("/api/parameters")
def api_parameters(query: Optional[str] = None, limit: int = 200) -> JSONResponse:
    require_db()
    return JSONResponse(get_parameters(query, limit))


@app.post("/api/submissions")
def api_submit(payload: dict) -> JSONResponse:
    require_db()
    required = ["vehicle_id", "parameter_id", "can_id"]
    missing = [k for k in required if k not in payload or payload[k] in (None, "")]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

    try:
        new_id = insert_submission(
            int(payload["vehicle_id"]),
            int(payload["parameter_id"]),
            str(payload["can_id"]).strip(),
            float(payload["multiplier"]) if payload.get("multiplier") not in (None, "") else None,
            float(payload["offset"]) if payload.get("offset") not in (None, "") else None,
            str(payload.get("notes")).strip() if payload.get("notes") not in (None,) else None,
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
