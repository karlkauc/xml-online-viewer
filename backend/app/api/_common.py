"""Shared helpers for the API routers."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile

from app.config import settings


async def read_upload(upload: UploadFile) -> bytes:
    """Read an upload into memory, enforcing the configured size cap."""
    max_bytes = settings.max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"upload exceeds {settings.max_upload_mb} MB limit",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def reject_oversized_text(data: bytes) -> None:
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"content exceeds {settings.max_upload_mb} MB limit",
        )
