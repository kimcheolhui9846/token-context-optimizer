export type ContextMode = "exact" | "semantic" | "visual" | "unknown";
export type Confidence = "low" | "medium" | "high";

export interface SourceLine {
  line: number;
  startByte: number;
  endByte: number;
  text: string;
  delimiter: string;
}

export interface ArtifactRecord {
  artifactId: string;
  path: string;
  sha256: string;
  byteLength: number;
  lineCount: number;
  content: string;
  sourceMap: SourceLine[];
}

export type ImageArtifactRecord = {
  artifactId: string;
  path: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  bitDepth: 8;
} & ({
  format: "png";
  mimeType: "image/png";
  channels: 3 | 4;
  validationProfile: "png-rgb8-static-v1";
} | {
  format: "png";
  mimeType: "image/png";
  channels: 3 | 4;
  validationProfile: "png-rgb8-tolerant-v1";
  ignoredChunks: string[];
  alpha: "none" | "opaque" | "present";
} | {
  format: "jpeg";
  mimeType: "image/jpeg";
  channels: 3;
  validationProfile: "jpeg-ycbcr8-baseline-444-v1";
} | {
  format: "jpeg";
  mimeType: "image/jpeg";
  channels: 3;
  validationProfile: "jpeg-ycbcr8-tolerant-v1";
  coding: "baseline" | "extended" | "progressive";
  sampling: "1x1,1x1,1x1" | "2x1,1x1,1x1" | "1x2,1x1,1x1" | "2x2,1x1,1x1";
  ignoredSegments: string[];
  exifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
});

export interface CommonResponseFields {
  artifactId: string;
  sha256: string;
  estimatedTokens: number;
  confidence: Confidence;
  warnings: string[];
  fallbackReason: string | null;
}

export interface ContextClassification {
  mode: ContextMode;
  reasons: string[];
  warnings: string[];
}

export interface TokenEstimate {
  estimatedTokens: number;
  maxTokens: number | null;
  fitsBudget: boolean;
  profileVersion: string;
  confidence: Confidence;
  warnings: string[];
}
