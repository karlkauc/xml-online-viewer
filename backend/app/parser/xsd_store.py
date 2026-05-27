"""Accept, validate and compile XSD schemas (single file or multi-file ZIP).

The cache holds each schema's source files keyed by relative path, so a
multi-file schema (include/import/redefine) can be re-materialised into a temp
directory at validation time, preserving the relative paths that
``schemaLocation`` references rely on.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from lxml import etree

from app.parser.security import _reject_known_bombs, make_parser


class XsdError(ValueError):
    """The submitted schema cannot be used: missing main file, unsafe path,
    or it does not compile as an XSD. Surfaced as HTTP 400/422 by the API."""


@dataclass
class StoredXsd:
    """In-memory cache entry for a compiled-and-verified schema."""

    xsd_id: str
    main_filename: str
    # Relative POSIX path -> raw file bytes.
    files: dict[str, bytes]


# ---------------------------------------------------------------------------
# Path safety (shared shape with the online_viewer materialiser)
# ---------------------------------------------------------------------------


def _safe_relative_path(filename: str, fallback: str) -> PurePosixPath:
    """Map a filename to a temp-dir-relative path, stripping traversal or
    absolute components. Falls back to ``fallback`` if nothing usable remains."""
    raw = filename.replace("\\", "/")
    if "://" in raw:
        raw = raw.split("://", 1)[1]
        raw = raw.split("/", 1)[1] if "/" in raw else ""
    parts = [
        seg
        for seg in PurePosixPath(raw).parts
        if seg not in ("", ".", "..", "/") and "\x00" not in seg
    ]
    if not parts:
        return PurePosixPath(fallback)
    return PurePosixPath(*parts)


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------


_REF_TAGS = {"include", "import", "redefine", "override"}


def _referenced_paths(files: dict[str, bytes]) -> set[str]:
    """Collect the set of file paths referenced via ``schemaLocation`` across
    all schemas (xs:include/import/redefine/override), normalised to the same
    relative-path scheme as the ZIP entries. Used to find the root schema:
    the one no other schema points at."""
    referenced: set[str] = set()
    for name, data in files.items():
        if not name.lower().endswith(".xsd"):
            continue
        try:
            root = etree.fromstring(data, make_parser())
        except etree.XMLSyntaxError:
            continue
        base = PurePosixPath(name).parent
        for el in root.iter():
            if not isinstance(el.tag, str) or etree.QName(el).localname not in _REF_TAGS:
                continue
            loc = el.get("schemaLocation")
            if not loc or "://" in loc:
                continue
            # Resolve relative to the referencing file's directory, then
            # normalise the same way ZIP entries are keyed.
            resolved = str(_safe_relative_path(str(base / loc), loc))
            referenced.add(resolved)
            referenced.add(PurePosixPath(loc).name)  # also match by bare name
    return referenced


def _detect_root_xsd(files: dict[str, bytes], xsd_names: list[str]) -> str | None:
    """Return the single XSD that no other schema references, or None if the
    root is ambiguous (zero or several un-referenced schemas)."""
    referenced = _referenced_paths(files)
    roots = [n for n in xsd_names if n not in referenced and PurePosixPath(n).name not in referenced]
    return roots[0] if len(roots) == 1 else None


def _files_from_zip(zip_bytes: bytes, main_filename: str | None) -> tuple[dict[str, bytes], str]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as exc:
        raise XsdError(f"not a valid ZIP archive: {exc}") from exc

    files: dict[str, bytes] = {}
    for info in archive.infolist():
        if info.is_dir():
            continue
        rel = str(_safe_relative_path(info.filename, info.filename))
        data = archive.read(info)
        _reject_known_bombs(data)
        files[rel] = data

    xsd_names = [name for name in files if name.lower().endswith(".xsd")]
    if not files:
        raise XsdError("ZIP archive is empty")

    if main_filename:
        wanted = str(_safe_relative_path(main_filename, main_filename))
        main = next((n for n in files if n == wanted or n.endswith("/" + wanted)), None)
        if main is None:
            raise XsdError(f"main file {main_filename!r} not found in archive")
    elif len(xsd_names) == 1:
        main = xsd_names[0]
    elif (detected := _detect_root_xsd(files, xsd_names)) is not None:
        main = detected
    else:
        raise XsdError(
            "could not determine the main schema; specify main_filename "
            f"(candidates: {', '.join(sorted(xsd_names)) or 'none'})"
        )
    return files, main


def build_xmlschema(stored: StoredXsd) -> etree.XMLSchema:
    """Materialise ``stored`` into a temp dir and compile its main file.

    Raises :class:`XsdError` if the schema does not compile.
    """
    from tempfile import TemporaryDirectory

    with TemporaryDirectory(prefix="xsd-") as tmp:
        tmp_root = Path(tmp).resolve()
        main_on_disk: Path | None = None

        for rel, data in stored.files.items():
            target = (tmp_root / rel).resolve()
            if not target.is_relative_to(tmp_root):
                raise XsdError(f"refusing unsafe schema filename: {rel!r}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            if rel == stored.main_filename:
                main_on_disk = target

        if main_on_disk is None:
            raise XsdError("schema main file is unavailable; cannot validate")

        try:
            xsd_tree = etree.parse(str(main_on_disk), make_parser())
            return etree.XMLSchema(xsd_tree)
        except etree.XMLSchemaParseError as exc:
            raise XsdError(f"not a valid XSD schema: {exc}") from exc
        except etree.XMLSyntaxError as exc:
            raise XsdError(f"schema could not be parsed: {exc}") from exc


def load_xsd(
    *,
    zip_bytes: bytes | None,
    main_filename: str | None,
    main_bytes: bytes | None,
) -> StoredXsd:
    """Build a :class:`StoredXsd` from either a ZIP or a single schema file,
    verifying it compiles. Raises :class:`XsdError` on any failure."""
    if zip_bytes is not None:
        files, main = _files_from_zip(zip_bytes, main_filename)
    else:
        if main_bytes is None:
            raise XsdError("no schema content provided")
        _reject_known_bombs(main_bytes)
        name = str(_safe_relative_path(main_filename or "schema.xsd", "schema.xsd"))
        files, main = {name: main_bytes}, name

    stored = StoredXsd(xsd_id="", main_filename=main, files=files)
    # Compile once now to fail fast on an invalid schema.
    build_xmlschema(stored)
    return stored
