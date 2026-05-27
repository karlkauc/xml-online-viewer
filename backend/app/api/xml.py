"""XML document upload / retrieval endpoints."""

from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, HTTPException, Request, UploadFile
from lxml import etree
from pydantic import BaseModel, Field

from app.api._common import read_upload, reject_oversized_text
from app.cache import xml_cache
from app.parser.security import SecurityError, fetch_url
from app.parser.xml_tree import StoredXml, XmlDocModel, parse_xml
from app.rate_limit import READ_LIMIT, WRITE_LIMIT, limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["xml"])


class TextPayload(BaseModel):
    filename: str = Field(default="document.xml")
    content: str = Field(..., description="Raw XML content")


class UrlPayload(BaseModel):
    url: str = Field(..., description="Absolute http(s) URL of the XML document")


def _finalize(stored: StoredXml) -> XmlDocModel:
    payload = stored.model.reformatted_xml.encode("utf-8")
    xml_id = hashlib.sha256(payload).hexdigest()[:32]
    stored.model.xml_id = xml_id
    xml_cache.put(xml_id, stored)
    logger.info(
        "xml parsed",
        extra={"ctx_xml_id": xml_id, "ctx_nodes": stored.model.node_count},
    )
    return stored.model


def _parse(data: bytes, filename: str) -> XmlDocModel:
    try:
        stored = parse_xml(data, filename)
    except etree.XMLSyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"XML is not well-formed: {exc}") from exc
    except SecurityError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _finalize(stored)


@router.post("/xml/upload", response_model=XmlDocModel)
@limiter.limit(WRITE_LIMIT)
async def upload_xml(request: Request, file: UploadFile) -> XmlDocModel:
    content = await read_upload(file)
    return _parse(content, file.filename or "document.xml")


@router.post("/xml/text", response_model=XmlDocModel)
@limiter.limit(WRITE_LIMIT)
async def upload_xml_text(request: Request, payload: TextPayload) -> XmlDocModel:
    data = payload.content.encode("utf-8")
    reject_oversized_text(data)
    return _parse(data, payload.filename)


@router.post("/xml/url", response_model=XmlDocModel)
@limiter.limit(WRITE_LIMIT)
async def upload_xml_url(request: Request, payload: UrlPayload) -> XmlDocModel:
    try:
        fetched = fetch_url(payload.url)
    except SecurityError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _parse(fetched.content, fetched.url)


@router.get("/xml/{xml_id}", response_model=XmlDocModel)
@limiter.limit(READ_LIMIT)
async def get_xml(request: Request, xml_id: str) -> XmlDocModel:
    stored = xml_cache.get(xml_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="XML not found or expired")
    return stored.model
