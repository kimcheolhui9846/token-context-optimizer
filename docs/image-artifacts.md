# Restricted PNG artifacts

Task 20 supplies partial research milestone M1a: validate and identify a local PNG
original without writing it. This is an input contract for owned or synthetic
canonical fixtures. It does not provide image optimization or model evidence.

## Supported input

The `png-rgb8-static-v1` profile accepts PNG signature bytes followed by one IHDR,
contiguous IDAT chunks and one empty IEND at physical EOF. IHDR must specify
8-bit RGB or RGBA, standard compression/filter methods and no interlacing.
Every chunk's bounds and CRC are checked. Inflation must consume the entire
compressed stream and produce exactly the expected scanlines with filter bytes
0–4 before a separate PNG decode is accepted.

All other chunks are rejected, including text, color profiles, transparency
metadata and animation control. Many otherwise valid PNGs therefore do not
qualify. Palette/grayscale/16-bit/interlaced PNGs, APNG, JPEG and WEBP are outside
this first profile. The tools never convert unsupported originals automatically.

| Limit | Maximum |
|---|---:|
| Encoded file | 10 MiB (10,485,760 bytes) |
| Either dimension | 8,192 pixels |
| Width × height | 16,777,216 pixels |

These fixed limits are engineering ceilings, not visual quality thresholds.
They cannot be raised through MCP arguments. Encoded input is read with a bound;
dimensions are checked before pixel allocation and inflation is capped at the
expected scanline length. The pure JavaScript `fast-png` decoder runs only after
preflight. Its CRC option alone is not a memory limit.

Peak memory exceeds the encoded-file limit: captured bytes, concatenated IDAT,
inflated scanlines and decoder pixel buffers can coexist. Individual pixel or
scanline buffers can approach 64 MiB. Decoding is synchronous; the caps do not
provide a wall-clock deadline or a total process-memory budget. The session store
keeps metadata only and currently has no entry-count limit.

## MCP use

Set `TCO_ALLOWED_ROOTS` to workspace roots separated by `;` before starting the
server. Image access with an empty allowlist is denied. Paths are canonicalized;
sibling-prefix paths and links that resolve outside authorized roots are denied.
The source must be a regular file. These checks are application-level access
controls, not a race-proof sandbox against hostile concurrent filesystem changes.

1. Call `index_image_artifact` with `{"path":"C:/workspace/fixture.png"}`.
2. Retain the returned `artifactId` in the current MCP session.
3. Call `inspect_image_artifact` with `{"artifactId":"<returned image ID>"}`
   to reauthorize and reread the source and compare its hash.

Both tools return the same record as JSON text and structured content:

| Field | Meaning |
|---|---|
| `artifactId` | `image_` identity derived from canonical path and original hash |
| `path` | Canonical original file path |
| `sha256` | SHA-256 of the exact captured bytes that were validated |
| `byteLength` | Original encoded bytes |
| `format`, `mimeType` | `png`, `image/png` |
| `width`, `height` | Validated pixel dimensions |
| `channels`, `bitDepth` | 3 or 4 channels, 8-bit depth |
| `validationProfile` | `png-rgb8-static-v1` |

Records contain no pixels, OCR or ancillary metadata. The same canonical path
and bytes produce the same ID; a different path is a distinct source even if its
bytes match. Store reads and writes copy the metadata. Failed indexing does not
insert a record. Existing text artifact IDs and APIs remain separate.

Indexing is a validated snapshot, not a backup or an immutable source archive.
The tools never write the source, but another process can change or delete it.
Inspection then fails; records disappear when the server restarts. If a changed
source is intentional, index it again and retain its new identity.

## Error contract

Image validation failures use stable codes rather than filesystem paths,
dependency exception text or source bytes. Through MCP they are tool errors;
they are not successful artifact records.

| Code | Meaning |
|---|---|
| `path_denied` | No authorized canonical root contains the source, or the allowlist is empty |
| `read_failure` | Indexing cannot resolve or read the source |
| `non_regular_file` | The indexed source is not a regular file |
| `encoded_size_exceeded` | The indexed source exceeds the encoded limit |
| `image_dimensions_exceeded` | Dimensions are zero or exceed the supported axis/pixel ceilings |
| `unsupported_image_format` | A recognized non-PNG image format is outside this profile |
| `unsupported_png_profile` | The PNG uses unsupported modes or chunks |
| `malformed_png` | Signature, structure, CRC, compressed data or decoded shape is invalid |
| `unknown_artifact_id` | The image ID is absent from this server's store |
| `source_changed` | Indexing detected a source change, or inspection successfully read bytes whose hash/length differ from the record |
| `source_missing_or_unreadable` | Inspection cannot obtain the recorded source |

Inspection preserves `path_denied` from the bounded reader. It maps every other
reader failure—including nonregular input, encoded-size excess and a concurrent
change detected during the read—to `source_missing_or_unreadable`. Only after a
successful read does a differing recorded hash/length produce `source_changed`.

Resolve access/read errors at the original source. For unsupported input, retain
the original and use an appropriate viewing workflow; rejection is not a request
to overwrite or silently normalize it. There is no automatic retry, conversion,
upload or model call.

## Research boundary

The [paper](research/image-first-paper-draft.ko.md) and
[evaluation protocol](research/image-first-evaluation-protocol.md) still describe
planned transformations and experiments. This slice does not resize, crop,
re-encode, run OCR, select evidence, apply a guard/fallback, call a model or
estimate image tokens. It cannot run the full four-condition image pilot.
Software checks and the existing text benchmark are not evidence of image
accuracy, readability, latency or billing savings. Video remains a later,
separately approved extension after image evaluation.
