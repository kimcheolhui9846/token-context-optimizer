// ko-header-strip: lossless 8-bit grey PNG decode/encode with the research lockfile's sharp (protocol 5.3).
import { createHash } from "node:crypto";
import sharp from "sharp";

export const sharpVersions = () => ({ sharp: sharp.versions.sharp, libvips: sharp.versions.vips, libpng: sharp.versions.png });
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
/** SHA-256 of decoded one-channel pixels in row-major order. */
export const pixelSha256 = (data) => sha256(data);

/** Decode a PNG to one-channel pixels. Fails unless the decoder yields exactly one 8-bit channel. */
export async function decodeGray(buf) {
  const meta = await sharp(buf).metadata();
  if (meta.format !== "png" || meta.channels !== 1 || meta.depth !== "uchar" || meta.hasAlpha) {
    throw new Error(`not an 8-bit one-channel PNG: format ${meta.format}, channels ${meta.channels}, depth ${meta.depth}`);
  }
  const { data, info } = await sharp(buf).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || data.length !== info.width * info.height) throw new Error(`decoded ${info.channels} channels`);
  return { width: info.width, height: info.height, data };
}

/** Encode one-channel pixels as an 8-bit grey PNG (colour type 0, no resize). */
export async function encodeGray(raw, width, height) {
  if (raw.length !== width * height) throw new Error("raw size mismatch");
  const png = await sharp(raw, { raw: { width, height, channels: 1 } })
    .toColourspace("b-w")
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, force: true })
    .toBuffer();
  if (png[24] !== 8 || png[25] !== 0) throw new Error(`encoded PNG is not 8-bit grey: depth ${png[24]}, colour type ${png[25]}`);
  return png;
}
