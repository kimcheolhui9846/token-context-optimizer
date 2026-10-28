# Restricted PNG and JPEG artifacts

The image artifact contract validates and identifies local PNG and JPEG originals
and supports bounded, explicit crops. It is an input contract for owned or
synthetic canonical fixtures. Crop output is a quality-75 JPEG with provenance;
it is not image optimization or model evidence.

## Supported input

The `png-rgb8-static-v1` profile accepts PNG signature bytes followed by one IHDR,
contiguous IDAT chunks and one empty IEND at physical EOF. IHDR must specify
8-bit RGB or RGBA, standard compression/filter methods and no interlacing.
Every chunk's bounds and CRC are checked. Inflation must consume the entire
compressed stream and produce exactly the expected scanlines with filter bytes
0–4 before a separate PNG decode is accepted.

`index_image_artifact` defaults to this strict profile. Pass
`{"profile":"tolerant"}` to opt into `png-rgb8-tolerant-v1`: it keeps the same
8-bit RGB/RGBA and size limits, CRC checks, and core chunk ordering, while
ignoring at most 32 distinct ancillary chunk types (including `sRGB`, `gAMA`, and
`pHYs`) without interpreting their payloads. Color information in `iCCP`, `sRGB`,
`gAMA`, and `cHRM` is not applied; stored pixel values are used without color management. The returned record lists
their first-seen names in `ignoredChunks` and reports PNG alpha as `none`,
`opaque`, or `present`.
RGB PNGs report `none`; RGBA PNGs report `opaque` only when every alpha byte is
255, otherwise `present`. Repeated chunk types count once; a 33rd distinct type
returns `unsupported_png_profile`.

The tolerant decoder receives only the original PNG signature, IHDR, contiguous
IDAT chunks, and IEND, including their original CRC bytes. Ancillary payloads
are excluded from decoder input after their bounds and CRC are checked.

In strict mode, all other chunks are rejected, including text, color profiles, transparency
metadata and animation control. Many otherwise valid PNGs therefore do not
qualify. The current runtime accepts `png-rgb8-static-v1`,
`png-rgb8-tolerant-v1`, and `jpeg-ycbcr8-baseline-444-v1`; palette/grayscale/16-bit/interlaced PNGs, APNG,
progressive/subsampled JPEG and WEBP are not accepted. PLTE, tRNS, APNG control,
and unknown critical chunks remain rejected in tolerant mode. Broader format support
belongs to a later contract. The tools never
convert unsupported originals automatically.

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

The `jpeg-ycbcr8-baseline-444-v1` profile accepts JFIF 1.01 or 1.02 baseline
SOF0 JPEGs with 8-bit YCbCr, three 1x1 components, one interleaved sequential
Huffman scan, and no metadata segments beyond APP0 JFIF. Progressive, arithmetic,
grayscale, CMYK/YCCK, restart, multiscan, and subsampled JPEGs are rejected.
JPEG marker bounds, table references, MCU scan structure, stuffed bytes, and the
terminal EOI are checked before the strict `jpeg-js` decoder runs. JPEG uses the
same 10 MiB encoded, 8192 axis, and 16,777,216 pixel limits, plus a 128 MiB
decoder allocation accounting ceiling. The decoder is synchronous; these limits
do not provide a wall-clock deadline or total process-memory guarantee.

At the end of the expected MCU data, the entropy reader accepts one trailing
`FF 00` pair only when the MCU data ends exactly at a byte boundary, matching
the observed `jpeg-js` encoder output. It rejects an `FF 00` pair after
partial-byte padding, additional trailing pairs, or altered pairs; when MCU
data ends within a byte, only the required all-one residual padding bits are accepted.

Checked-in JPEG positives live under `tests/fixtures/jpeg/`: 1x1, odd 17x9,
and multi-MCU 17x17. `provenance.json` records the independent sharp 0.35.4
encoder, libvips/mozjpeg versions, options, deterministic RGB pattern, and
SHA-256 values. The reproducible generator uses an ignored scratch install and
inserts a canonical JFIF APP0 segment immediately after SOI in sharp's output;
the insertion does not alter the entropy-coded scan.

The jpeg-js decoder accounting guard is separate from process RSS. For
`B = ceil(width/8) * ceil(height/8)`, the current estimate is
`960*B + 6*width*height + 256*Q + sum(16 + DHT symbol count)`, where `Q` is
the number of defined quantization tables. It is checked before decoding and
bounded at 128 MiB; synchronous CPU time and total process memory remain
unbounded by this accounting value.

## MCP use

Set `TCO_ALLOWED_ROOTS` to workspace roots separated by `;` before starting the
server. Image access with an empty allowlist is denied. Paths are canonicalized;
sibling-prefix paths and links that resolve outside authorized roots are denied.
The source must be a regular file. These checks are application-level access
controls, not a race-proof sandbox against hostile concurrent filesystem changes.

The reader rejects the replacement cases covered here: same-size in-place
overwrite, rename replacement after bytes are read, directory-junction
retargeting after canonicalization, and a same-file byte replacement whose
original mtime is restored. These are pathname and metadata checks across
separate operations, not an atomic filesystem transaction. They do not
establish containment against an adversarial intermediate-directory ABA swap;
the tests cover persistent replacement, not every swap-and-restore schedule.
On Windows, `O_NOFOLLOW` is unavailable as a complete defense. The contract
therefore assumes trusted writers and ordinary permissions on allowed
directories and their ancestors; atomic OS-specific path/handle containment is
outside the current PNG artifact contract.

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
| `format`, `mimeType` | `png`/`image/png` or `jpeg`/`image/jpeg` |
| `width`, `height` | Validated pixel dimensions |
| `channels`, `bitDepth` | PNG: 3 or 4 channels; JPEG: 3 channels; 8-bit depth |
| `validationProfile` | `png-rgb8-static-v1`, `png-rgb8-tolerant-v1`, or `jpeg-ycbcr8-baseline-444-v1` |

Tolerant PNG records also contain `ignoredChunks` and `alpha`. Profile selection
is part of validation: tolerant PNGs have a profile-specific artifact ID, while
strict PNG and JPEG IDs retain their existing identity behavior. JPEG fallback
remains strict and uses `jpeg-ycbcr8-baseline-444-v1`; it has no tolerant PNG
fields. A JPEG indexed with `profile: "tolerant"` therefore has the same ID and
stored record as a strict request for the same path and bytes.

Records contain no pixels, OCR or ancillary metadata payload; tolerant records
retain only ignored chunk names and alpha state. The same canonical path, bytes,
and validation profile produce the same ID; a different path is a distinct source even if its
bytes match. Store reads and writes copy the metadata. Failed indexing does not
insert a record. Existing text artifact IDs and APIs remain separate.

## MCP crop use

Call `crop_image_artifact` with `{"artifactId":"<indexed image ID>","region":{"x":0,"y":0,"width":512,"height":512}}`.
Coordinates are zero-based safe integers. Empty regions return `region_empty`;
negative or out-of-bounds regions return `region_out_of_bounds`; an unknown ID
returns `artifact_not_indexed`. A full-frame region returns the validated
original without encoding. Strict RGBA and non-opaque tolerant RGBA partial crops return `alpha_unsupported`,
and any non-full-frame crop wider or taller than 1536 pixels returns an
`isError` response with `status:"rejected"` and `code:"resize_required"`.

The caller chooses the rectangle, optionally using an overview supplied by its
own workflow. This tool does not generate an overview or choose an area. Right
and bottom edges are exclusive; coordinates are never rounded or clamped.
Full-frame requests take priority over the 1536 cap and RGBA rejection, including
large RGBA originals. Strict RGBA and tolerant PNGs with `alpha:"present"` are
rejected for partial crops with `alpha_unsupported`; tolerant PNGs with
`alpha:"opaque"` may be partially cropped. For an oversized partial RGBA crop,
`resize_required` takes priority.

Original and resize-required responses include the revalidated source record;
they carry no image bytes or invented output/encoder fields. References describe
the validation-time snapshot: recheck the SHA or call `inspect_image_artifact`
before a later read. Other failures return a sanitized code as text with
`isError:true` and no structured content. Empty regions are rejected before file
access, so a known ID with an empty rectangle returns `region_empty` even if its
path is now denied or changed. Unknown IDs take priority over empty rectangles.

Successful crops include JPEG bytes as MCP image content and return metadata in
structured content: dimensions, original source and region, SHA-256,
byteLength, quality 75, `jpeg-js` 0.4.4 encoder provenance, and output JPEG
validation. The source is reread and its captured hash and file snapshot are
checked before pixels are cropped; no source or artifact store files are written.

JPEG inputs are also decoded and re-encoded at q75; only full-frame requests skip
encoding. Existing input limits and JPEG decoder accounting remain in force.
The crop RGBA buffer is bounded by 1536 × 1536 × 4 = 9 MiB before allocation,
without a full-source RGBA copy. Decoder and encoder temporaries still contribute
to memory use: there is no process RSS ceiling or wall-clock deadline. No token
estimate is returned, and JPEG quality alone does not establish token savings.

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
| `read_failure` | Indexing cannot read a source whose canonical path, or nearest existing ancestor, lies inside an authorized canonical root |
| `non_regular_file` | The indexed source is not a regular file |
| `encoded_size_exceeded` | The indexed source exceeds the encoded limit |
| `image_dimensions_exceeded` | Dimensions are zero or exceed the supported axis/pixel ceilings |
| `unsupported_image_format` | The encoded bytes identify a recognized container with no supported image profile |
| `unsupported_png_profile` | The PNG uses unsupported modes or chunks |
| `malformed_png` | Signature, structure, CRC, compressed data or decoded shape is invalid |
| `unsupported_jpeg_profile` | The JPEG uses an unsupported mode, sampling, or metadata profile |
| `malformed_jpeg` | JPEG marker, table, entropy, or decoded shape is invalid |
| `jpeg_resource_limit` | The JPEG decoder allocation estimate exceeds the 128 MiB accounting ceiling |
| `unknown_artifact_id` | The image ID is absent from this server's store |
| `artifact_not_indexed` | The crop request references an image ID absent from the store |
| `region_empty` | Crop width or height is zero or negative |
| `region_out_of_bounds` | Crop coordinates are negative or exceed the source dimensions |
| `alpha_unsupported` | A partial crop was requested from an RGBA source |
| `resize_required` | A non-full-frame crop exceeds 1536 on either axis; structured error includes the source reference |
| `invalid_region` | Core crop arguments are malformed or their coordinate sums are unsafe; MCP also validates its input schema |
| `decode_failed` | Crop pixels or decoded metadata do not match the validated source |
| `encode_failed` | The JPEG encoder failed |
| `output_validation_failed` | Encoded JPEG failed validation or has unexpected dimensions; no image is returned |
| `source_changed` | Indexing or cropping detected a source change, or inspection successfully read bytes whose hash/length differ from the record |
| `source_missing_or_unreadable` | Inspection or cropping cannot obtain the recorded source |

Crop preserves reader-detected `source_changed` as well as post-read SHA/length
mismatches. Inspection retains its existing mapping: reader failures other than
`path_denied` become `source_missing_or_unreadable`. Crop applies that mapping to
other reader failures too, and never attaches a valid-source reference to a
`source_changed` error.

Error precedence is deterministic. Reader and encoded-size failures occur before
format validation; a recognized but unsupported profile maps to
`unsupported_jpeg_profile`. For JPEG, an invalid APP0 JFIF identifier or a
missing APP0 is classified as an unsupported profile, while a duplicate APP0,
invalid table marker or payload, invalid entropy data, and decoded-shape mismatch
are `malformed_jpeg`. An SOS with a missing SOF or an invalid SOS payload length
is also `unsupported_jpeg_profile` under the current parser order. Resource
limits are checked after structural tables and scan selectors are available and
before the decoder call.

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
planned transformations and experiments. This slice does not resize, run OCR,
select evidence, apply a guard/fallback, call a model or
estimate image tokens. It cannot run the full four-condition image pilot.
Software checks and the existing text benchmark are not evidence of image
accuracy, readability, latency or billing savings. Video remains a later,
separately approved extension after image evaluation.
