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
`png-rgb8-tolerant-v1`, `jpeg-ycbcr8-baseline-444-v1`, and the opt-in
`jpeg-ycbcr8-tolerant-v1`; palette/grayscale/16-bit/interlaced PNGs, APNG,
WEBP, and JPEGs outside the profiles below are not accepted. PLTE, tRNS, APNG control,
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
Because the estimate grows by about 21 bytes per pixel for this 4:4:4 profile,
the 128 MiB ceiling admits JPEGs up to about 6.39 million pixels (for example,
3088×2064 is admitted but 3088×2069 is not). Larger JPEGs return
`jpeg_resource_limit` even though they are within the 16,777,216 pixel limit.

JPEG validation also defaults to this strict profile. Pass `{"profile":"tolerant"}`
to opt into `jpeg-ycbcr8-tolerant-v1`. It accepts 8-bit three-component YCbCr
(component IDs 1, 2, 3) coded as baseline SOF0, extended sequential Huffman SOF1,
or progressive Huffman SOF2. Y sampling may be 1x1, 2x1, 1x2, or 2x2 with Cb and
Cr at 1x1; the record reports `coding` (`baseline`, `extended`, `progressive`)
and `sampling` (`1x1,1x1,1x1`, `2x1,1x1,1x1`, `1x2,1x1,1x1`, `2x2,1x1,1x1`).
Grayscale, CMYK/YCCK, 12-bit, lossless, arithmetic, and other sampling remain
`unsupported_jpeg_profile`. Marker bounds, table definitions and references,
scan parameters, restart-marker order, and the terminal EOI are checked by this
project before the `jpeg-js` decoder runs with `tolerantDecoding: false`.
The tolerant profile accepts at most 64 SOS scans across the whole JPEG file.
The walker rejects the 65th with `jpeg_resource_limit` before decoder invocation;
the strict profile still allows one scan. There is no wall-clock deadline.
Accepted progressive scans can require repeated full-image decoder passes,
including on small encoded files, so the 10 MiB encoded-size and 256 MiB decoder
allocation checks are not a CPU-time bound.

APP0–APP15 and COM segments are bounds-checked and their names are recorded once,
in first-seen order, in `ignoredSegments`; payloads and counts are not stored.
APP0 is optional, but when present it must be valid JFIF. APP14 must be a valid
Adobe segment with transform 1; transform 0/2 or an uninterpretable Adobe
segment is `unsupported_jpeg_profile`. APP1 EXIF is read only to report
`exifOrientation`: the first APP1 in file order with a valid TIFF orientation
tag (SHORT, count 1, value 1–8) supplies the value; otherwise it is `null`.
Neither orientation nor ICC color is applied. Images whose orientation is not 1
may appear rotated, and dimensions, crop regions, and overviews always use the
stored pixel coordinates.

Tolerant validation is not corruption detection. A changed entropy-coded bit can
still decode as different, valid-looking pixels, and a JPEG altered before
indexing may be accepted if it decodes. Integrity after indexing comes from the
whole-file SHA-256 captured at index time: a later reread whose bytes differ
returns `source_changed`.

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
unbounded by this accounting value. The strict estimate and its 128 MiB
`maxMemoryUsageInMB` option are unchanged by the tolerant profile.

The tolerant profile uses a separate 256 MiB ceiling (`256 * 1024 * 1024`
bytes) and follows the allocations of the pinned `jpeg-js` 0.4.4 decoder
exactly rather than an MP approximation. With SOF component sampling factors
`h`/`v`:

```text
maxH = max(h), maxV = max(v)
mcusPerLine   = ceil(width / 8 / maxH)
mcusPerColumn = ceil(height / 8 / maxV)
estimate = 6 * width * height
for each component:
  blocksPerLine   = ceil(ceil(width / 8) * h / maxH)
  blocksPerColumn = ceil(ceil(height / 8) * v / maxV)
  estimate += 256 * (mcusPerLine * h) * (mcusPerColumn * v)
  estimate += 64 * blocksPerLine * blocksPerColumn
estimate += 256 * (every DQT table definition)
estimate += sum over every DHT table definition of (16 + symbol count)
```

Table terms are cumulative over the whole file: a redefined table still counts
its earlier definitions, because the decoder does not release them. MCU
alignment and per-component sizes therefore matter for dimensions that are not
multiples of 16. An estimate equal to the ceiling is accepted; a larger estimate
returns `jpeg_resource_limit` before decoding. Repinning the decoder version
requires reviewing this formula and its boundary tests against the new source.

Rough scales such as about 6.39 MP for strict 4:4:4, about 12.8 MP for tolerant
4:4:4, and the 16,777,216-pixel cap for tolerant 4:2:0 are explanations only;
the exact formula, including alignment and table definitions, decides
acceptance. Like the strict value, this is decoder allocation accounting, not a
process RSS bound: input copies, JavaScript objects and strings, COM payloads,
and runtime overhead are not included, and no RSS guarantee is made.

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
outside the current image artifact contract.

1. Call `index_image_artifact` with `{"path":"C:/workspace/fixture.png"}`.
2. Retain the returned `artifactId` in the current MCP session.
3. Call `inspect_image_artifact` with `{"artifactId":"<returned image ID>"}`
   to reauthorize and reread the source and compare its hash.

Both tools return the same record as JSON text and structured content:

| Field | Meaning |
|---|---|
| `artifactId` | `image_` identity hashed from canonical path and original hash, plus the validation profile name for non-strict profiles |
| `path` | Canonical original file path |
| `sha256` | SHA-256 of the exact captured bytes that were validated |
| `byteLength` | Original encoded bytes |
| `format`, `mimeType` | `png`/`image/png` or `jpeg`/`image/jpeg` |
| `width`, `height` | Validated pixel dimensions |
| `channels`, `bitDepth` | PNG: 3 or 4 channels; JPEG: 3 channels; 8-bit depth |
| `validationProfile` | `png-rgb8-static-v1`, `png-rgb8-tolerant-v1`, `jpeg-ycbcr8-baseline-444-v1`, or `jpeg-ycbcr8-tolerant-v1` |

Tolerant PNG records also contain `ignoredChunks` and `alpha`. Tolerant JPEG
records also contain `coding`, `sampling`, `ignoredSegments`, and
`exifOrientation` (integer 1–8 or `null`); strict JPEG records have none of
these fields, and JPEG records never carry PNG fields. Profile selection is part
of validation: tolerant PNG and tolerant JPEG records have profile-specific
artifact IDs, while strict PNG and JPEG IDs retain their existing identity
behavior. A JPEG that also passes strict validation still receives a tolerant
record and a distinct ID when requested with `profile: "tolerant"`; the two
records do not overwrite each other.

Compatibility change: in earlier releases a JPEG indexed with
`profile: "tolerant"` fell back to strict validation and returned the same ID and
record as a strict request. It now returns the distinct tolerant profile and ID.
Strict IDs are unchanged. Records live only in the server process's memory, so
no persisted record migration is involved.

Records contain no pixels, OCR or ancillary metadata payload; tolerant records
retain only ignored chunk or segment names, alpha state, and the JPEG fields
above. The same canonical path, bytes,
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

The caller chooses the rectangle, optionally using `overview_image_artifact`
or an overview supplied by its own workflow. The crop tool does not generate an
overview or choose an area. Right
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

## MCP overview use

Call `overview_image_artifact` with `{"artifactId":"<indexed image ID>","maxSide":512}`
to obtain a whole-image overview as MCP image content plus structured metadata.
`maxSide` defaults to 512 and must be an integer from 64 through 1536; images are
never enlarged, and invalid maxSide values are rejected rather than clamped. The
output is a quality-75 JPEG with `jpeg-js` 0.4.4 provenance,
strict JPEG validation, and `resample:"area-average-v1"`. The integer area-average
resampler is a product contract and is intentionally different from the research
harness's `sharp` `lanczos3` transformation; their pixels and measurements are
not interchangeable.

The output dimensions are the source dimensions when the source already fits the
requested bound, including a 1:1 request. Even in that case the overview is
deterministically re-encoded as q75 JPEG; it never takes the crop tool's original-
reference bypass and never returns `resize_required`. The MCP response keeps the
base64 JPEG in one `image/jpeg` content item and returns JSON metadata separately:
`structuredContent` and the text JSON contain `source` and `output` metadata but
not the image string. Output metadata includes dimensions, format/mime type,
byteLength, SHA-256, quality, encoder, resample, and strict JPEG validation.

Overviews accept indexed RGB PNGs, tolerant PNG records whose RGBA alpha is fully
opaque, and supported JPEG inputs. A strict RGBA source or a tolerant PNG with
`alpha:"present"` returns `alpha_unsupported` when an overview is requested;
there is no full-frame original-reference bypass for this operation. Tolerant
opaque RGBA is the only RGBA overview exception.
The source is reread and revalidated before pixels are processed; no source or
artifact-store files are written. Invalid input, missing IDs, source changes,
decode failures, and unreadable sources retain the existing sanitized error
contract.

Overview error precedence is deterministic: validate the input object and
`artifactId`/`maxSide`, look up the indexed record, read and revalidate the
source, apply the supported-profile/alpha check, encode the q75 JPEG, then
validate the output JPEG. The first failing stage supplies the error; later
stages are not attempted.

Use the overview to orient a caller, not to choose a region automatically. Map an
overview coordinate back to original-image pixels with
`x_src = floor(x * sourceWidth / width)` and
`y_src = floor(y * sourceHeight / height)`, then call `crop_image_artifact` with a
caller-chosen, in-bounds rectangle in original-image pixels. Limit rectangle
endpoints to the source dimensions before calling crop; crop itself does not
clamp them. An overview does not
select evidence and may be too small to read exact values; it provides no
guarantee of readability or exact-value accuracy. The crop tool still owns its
existing 1536-pixel limit, full-frame exception, coordinate semantics, and
`alpha_unsupported`/`resize_required` behavior.

For small text or questions requiring exact values, use the overview only to find
the relevant area and then crop the original-image pixels; do not infer a value
from downscaled overview text.

Overview processing uses the same input ceilings as indexing: 10 MiB encoded,
8192 pixels per axis, and 16,777,216 total pixels. The deterministic resampler
uses an output RGBA buffer (`4 × width × height`, at most 9 MiB) plus two
working rows totaling `36 × outputWidth` bytes. It does not allocate a source-sized
RGBA copy or a source-by-output weight matrix. Decoder,
encoder, and captured-source temporaries add to that working set. These bounds
are not a process RSS ceiling or a wall-clock deadline.

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
| `jpeg_resource_limit` | The JPEG decoder allocation estimate exceeds the profile's accounting ceiling (strict 128 MiB, tolerant 256 MiB), or a tolerant JPEG contains more than 64 SOS scans |
| `unknown_artifact_id` | The image ID is absent from this server's store |
| `artifact_not_indexed` | The crop or overview request references an image ID absent from the store |
| `region_empty` | Crop width or height is zero or negative |
| `region_out_of_bounds` | Crop coordinates are negative or exceed the source dimensions |
| `alpha_unsupported` | A partial crop or an overview was requested from an RGBA source, unless it is a tolerant PNG record whose alpha is fully opaque |
| `resize_required` | A non-full-frame crop exceeds 1536 on either axis; structured error includes the source reference |
| `invalid_region` | Core crop arguments are malformed or their coordinate sums are unsafe; MCP also validates its input schema |
| `decode_failed` | Crop or overview pixels or decoded metadata do not match the validated source |
| `encode_failed` | The JPEG encoder failed |
| `output_validation_failed` | Encoded JPEG failed validation or has unexpected dimensions; no image is returned |
| `source_changed` | Indexing, cropping, or overview processing detected a source change, or inspection successfully read bytes whose hash/length differ from the record |
| `source_missing_or_unreadable` | Inspection, cropping, or overview processing cannot obtain the recorded source |
| `invalid_overview_input` | Core overview `artifactId` is empty/non-string or provided `maxSide` is not an integer from 64 through 1536; MCP rejects invalid input through its schema |

Crop and overview preserve reader-detected `source_changed` as well as post-read SHA/length
mismatches. Inspection retains its existing mapping: reader failures other than
`path_denied` become `source_missing_or_unreadable`. Crop applies that mapping to
other reader failures too, and never attaches a valid-source reference to a
`source_changed` error.

Error precedence for indexing/crop/inspection remains deterministic. Reader and encoded-size failures occur before
format validation; a recognized but unsupported profile maps to
`unsupported_jpeg_profile`. For strict JPEG, an invalid APP0 JFIF identifier or a
missing APP0 is classified as an unsupported profile, while a duplicate APP0,
invalid table marker or payload, invalid entropy data, and decoded-shape mismatch
are `malformed_jpeg`. An SOS with a missing SOF or an invalid SOS payload length
is also `unsupported_jpeg_profile` under the current parser order. Resource
limits are checked after structural tables and scan selectors are available and
before the decoder call.
For tolerant JPEG, APP0 may be absent or repeated, but each APP0 must be canonical
JFIF; a JFXX or invalid APP0 is `unsupported_jpeg_profile`. A non-Adobe or
otherwise invalid APP14 and a 16-bit DQT are also unsupported. Other malformed
DQT payloads and a redefinition of a referenced DQT after SOF are
`malformed_jpeg`. A duplicate SOF component ID is unsupported. The tolerant
parser checks marker structure before `jpeg-js` checks entropy, and a decoder
failure maps to `malformed_jpeg`.

Inspection preserves `path_denied` from the bounded reader. It maps every other
reader failure—including nonregular input, encoded-size excess and a concurrent
change detected during the read—to `source_missing_or_unreadable`. Only after a
successful read does a differing recorded hash/length produce `source_changed`.

Resolve access/read errors at the original source. For unsupported input, retain
the original and use an appropriate viewing workflow; rejection is not a request
to overwrite or silently normalize it. There is no automatic retry, conversion,
upload or model call.

## Research boundary

The [paper](research/image-first-paper-draft.ko.md) reports experiments that ran
on the separate research harness under `research/`, which implements resize,
OCR and query-aware region selection. [The evaluation protocol](research/image-first-evaluation-protocol.md)
records the earlier pilot design. This product slice provides a bounded
overview, but it does not run OCR, select evidence, choose a region, apply a
guard/fallback, call a model or estimate image tokens. It cannot run the full
four-condition image pilot. The paper evaluates the separate research harness,
not this product overview/crop path: its integer `area-average-v1` output must not
be compared as if it were the research `sharp`/`lanczos3` output. Software checks
and the existing text benchmark are not evidence of image accuracy, readability,
latency or billing savings, and an overview does not guarantee exact values.
Video remains a later, separately approved extension after image evaluation.
