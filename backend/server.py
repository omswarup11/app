"""Sanjeevan FastAPI app — Supabase Postgres backend."""
import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

import models  # noqa: F401  (register ORM tables)
from db import Base, engine, session_scope
from routes_auth import router as auth_router
from routes_booking import router as booking_router
from routes_clinics import router as clinics_router
from routes_queue import router as queue_router
from routes_records import router as records_router
from seed import seed_if_empty

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("sanjeevan")

app = FastAPI(title="Sanjeevan API")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(clinics_router)
app.include_router(booking_router)
app.include_router(queue_router)
app.include_router(records_router)


@app.get("/api/")
async def root():
    return {"service": "sanjeevan", "status": "ok"}


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with session_scope() as session:
        try:
            await seed_if_empty(session)
        except Exception as exc:  # pragma: no cover
            logger.warning("seed skipped: %s", exc)
    logger.info("Sanjeevan API ready (Postgres/Supabase).")
