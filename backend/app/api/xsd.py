"""XSD schema upload endpoints."""

from __future__ import annotations

import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.api._common import read_upload, reject_oversized_text
from app.cache import xsd_cache
from app.parser.security import SecurityError, fetch_url
from app.parser.xsd_store import StoredXsd, XsdError, load_xsd
from app.rate_limit import WRITE_LIMIT, limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["xsd"])


class TextPayload(BaseModel):
    filename: str = Field(default="schema.xsd")
    content: str = Field(..., description="Raw XSD content")


class UrlPayload(BaseModel):
    url: str = Field(..., description="Absolute http(s) URL of the XSD")


class XsdInfo(BaseModel):
    xsd_id: str
    main_filename: str
    filenames: list[str]


def _finalize(stored: StoredXsd) -> XsdInfo:
    digest = hashlib.sha256()
    for name in sorted(stored.files):
        digest.update(name.encode("utf-8"))
        digest.update(stored.files[name])
    xsd_id = digest.hexdigest()[:32]
    stored.xsd_id = xsd_id
    xsd_cache.put(xsd_id, stored)
    logger.info(
        "xsd loaded",
        extra={"ctx_xsd_id": xsd_id, "ctx_files": len(stored.files)},
    )
    return XsdInfo(
        xsd_id=xsd_id,
        main_filename=stored.main_filename,
        filenames=sorted(stored.files),
    )


def _load(*, zip_bytes: bytes | None, main_filename: str | None, main_bytes: bytes | None) -> XsdInfo:
    try:
        stored = load_xsd(zip_bytes=zip_bytes, main_filename=main_filename, main_bytes=main_bytes)
    except XsdError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SecurityError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _finalize(stored)


@router.post("/xsd/upload", response_model=XsdInfo)
@limiter.limit(WRITE_LIMIT)
async def upload_xsd(
    request: Request,
    file: UploadFile,
    main_filename: Annotated[str | None, Form()] = None,
) -> XsdInfo:
    content = await read_upload(file)
    name = file.filename or "schema.xsd"
    is_zip = name.lower().endswith(".zip") or (file.content_type or "").endswith("zip")
    if is_zip:
        return _load(zip_bytes=content, main_filename=main_filename, main_bytes=None)
    return _load(zip_bytes=None, main_filename=name, main_bytes=content)


@router.post("/xsd/text", response_model=XsdInfo)
@limiter.limit(WRITE_LIMIT)
async def upload_xsd_text(request: Request, payload: TextPayload) -> XsdInfo:
    data = payload.content.encode("utf-8")
    reject_oversized_text(data)
    return _load(zip_bytes=None, main_filename=payload.filename, main_bytes=data)


@router.post("/xsd/url", response_model=XsdInfo)
@limiter.limit(WRITE_LIMIT)
async def upload_xsd_url(request: Request, payload: UrlPayload) -> XsdInfo:
    try:
        fetched = fetch_url(payload.url)
    except SecurityError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _load(zip_bytes=None, main_filename=fetched.url, main_bytes=fetched.content)
