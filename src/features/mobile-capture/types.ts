export type MobileCaptureStage = 'BOOKING' | 'DELIVERY';

export type PageQualityFailureCode =
  | 'LOW_RESOLUTION'
  | 'TOO_BLURRY'
  | 'TOO_DARK'
  | 'TOO_BRIGHT'
  | 'NEAR_BLANK'
  | 'UNREADABLE_IMAGE';

export interface PageQualityMetrics {
  width: number;
  height: number;
  pixelCount: number;
  laplacianVariance: number;
  meanLuminance: number;
  luminanceStdDev: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  edgePixelRatio: number;
}

export interface PageQualityResult {
  passed: boolean;
  failures: PageQualityFailureCode[];
  metrics?: PageQualityMetrics;
}

export interface CapturedPage {
  id: string;
  sourceUri?: string;
  sourceBlob?: Blob;
  previewUrl: string;
  quality: PageQualityResult;
  ocrText: string;
  originalIndex: number;
}

export interface ContinuationDecision {
  score: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
}

export interface LogicalCapturedDocument {
  id: string;
  pages: CapturedPage[];
  autoGrouped: boolean;
  continuationFromPrevious?: ContinuationDecision;
}

export interface MobileCaptureTarget {
  stage: MobileCaptureStage;
  journeyId?: string;
  routePath: string;
}
