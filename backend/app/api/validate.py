"""Validate a cached XML document against a cached XSD; download Excel report."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.cache import validation_cache, xml_cache, xsd_cache
from app.parser.validate import ValidationResponse, validate
from app.parser.xsd_store import XsdError
from app.rate_limit import WRITE_LIMIT, limiter
from app.report.excel import build_report

logger = logging.getLogger(__name__)

router = APIRouter(tags=["validate"])


class ValidatePayload(BaseModel):
    xml_id: str = Field(..., description="id of a previously uploaded XML document")
    xsd_id: str = Field(..., description="id of a previously uploaded XSD schema")


@dataclass
class StoredValidation:
    response: ValidationResponse
    xml_filename: str
    xsd_filename: str
    reformatted_xml: str


@router.post("/validate", response_model=ValidationResponse)
@limiter.limit(WRITE_LIMIT)
async def run_validation(request: Request, payload: ValidatePayload) -> ValidationResponse:
    stored_xml = xml_cache.get(payload.xml_id)
    if stored_xml is None:
        raise HTTPException(status_code=404, detail="XML not found or expired")
    stored_xsd = xsd_cache.get(payload.xsd_id)
    if stored_xsd is None:
        raise HTTPException(status_code=404, detail="XSD not found or expired")

    try:
        result = validate(stored_xml, stored_xsd)
    except XsdError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    validation_id = hashlib.sha256(
        f"{payload.xml_id}:{payload.xsd_id}".encode()
    ).hexdigest()[:32]
    result.validation_id = validation_id
    validation_cache.put(
        validation_id,
        StoredValidation(
            response=result,
            xml_filename=stored_xml.model.filename,
            xsd_filename=stored_xsd.main_filename,
            reformatted_xml=stored_xml.model.reformatted_xml,
        ),
    )
    logger.info(
        "validation completed",
        extra={
            "ctx_validation_id": validation_id,
            "ctx_is_valid": result.is_valid,
            "ctx_errors": len(result.errors),
        },
    )
    return result


@router.get("/validate/{validation_id}/excel")
async def download_excel(validation_id: str) -> StreamingResponse:
    stored = validation_cache.get(validation_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="validation result not found or expired")
    data = build_report(
        stored.response,
        xml_filename=stored.xml_filename,
        xsd_filename=stored.xsd_filename,
        reformatted_xml=stored.reformatted_xml,
    )
    filename = f"validation_report_{validation_id[:8]}.xlsx"
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
