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

export interface ImageArtifactRecord {
  artifactId: string;
  path: string;
  sha256: string;
  byteLength: number;
  format: "png";
  mimeType: "image/png";
  width: number;
  height: number;
  channels: 3 | 4;
  bitDepth: 8;
  validationProfile: "png-rgb8-static-v1";
}

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
