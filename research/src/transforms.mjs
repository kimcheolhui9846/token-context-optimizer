// Shared image operations. Values follow the image-first protocol: stress 1024 / q50, arm transform 1536 / q75,
// target JPEG 4:4:4 baseline.
import sharp from "sharp";

export const STRESS = { longSide: 1024, quality: 50 };
export const ARM_TRANSFORM = { longSide: 1536, quality: 75 };
export const JPEG_OPTS = (quality) => ({ quality, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: false });
const fitInside = (longSide) => ({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true });

export const CONDITIONS = {
  clean: async (png) => ({ bytes: png, mime: "image/png", ops: [] }),
  "jpeg-only": async (png) => ({ bytes: await sharp(png).jpeg(JPEG_OPTS(STRESS.quality)).toBuffer(), mime: "image/jpeg", ops: [`jpeg q${STRESS.quality}`] }),
  "downscale-only": async (png) => ({ bytes: await sharp(png).resize(fitInside(STRESS.longSide)).removeAlpha().png({ compressionLevel: 9 }).toBuffer(), mime: "image/png", ops: [`resize<=${STRESS.longSide}`, "png"] }),
  combined: async (png) => ({ bytes: await sharp(png).resize(fitInside(STRESS.longSide)).jpeg(JPEG_OPTS(STRESS.quality)).toBuffer(), mime: "image/jpeg", ops: [`resize<=${STRESS.longSide}`, `jpeg q${STRESS.quality}`] }),
};

// Arm output transform: downscale to <=1536 without enlargement, then always re-encode as JPEG q75 (never skipped).
export async function armTransform(input) {
  const before = await sharp(input).metadata();
  const bytes = await sharp(input).resize(fitInside(ARM_TRANSFORM.longSide)).jpeg(JPEG_OPTS(ARM_TRANSFORM.quality)).toBuffer();
  const after = await sharp(bytes).metadata();
  const resized = after.width !== before.width || after.height !== before.height;
  return { bytes, ops: [resized ? `resize<=${ARM_TRANSFORM.longSide}` : `resize<=${ARM_TRANSFORM.longSide} (identity)`, `jpeg q${ARM_TRANSFORM.quality}`] };
}

export async function cropTransform(input, box) {
  const out = await armTransform(await sharp(input).extract(box).toBuffer());
  return { bytes: out.bytes, ops: [`crop ${box.width}x${box.height}+${box.left}+${box.top}`, ...out.ops] };
}
