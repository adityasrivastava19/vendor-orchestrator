export interface CheckInput {
  businessName: string;
  country: string;
  registrationNumber?: string;
}

export type CheckStatus = 'clear' | 'review' | 'fail' | 'error';

/** Vendor-agnostic result every vendor response is mapped into. */
export interface NormalizedResult {
  vendor: string;
  check: 'sanctions' | 'registry' | 'adverse_media';
  status: CheckStatus;
  riskScore: number; // 0 (no risk) .. 100 (max risk)
  details: Record<string, unknown>;
  attempts: number;
  latencyMs: number;
  error?: string;
}

export type Decision = 'approve' | 'review' | 'reject';

export interface KybCase {
  id: string;
  input: CheckInput;
  results: NormalizedResult[];
  riskScore: number;
  decision: Decision;
  idempotencyKey?: string;
  createdAt: string;
}

export interface Vendor {
  name: string;
  check: NormalizedResult['check'];
  /** Call the (mock) third-party API; vendor-specific raw payload. */
  call(input: CheckInput, signal: AbortSignal): Promise<unknown>;
  /** Map the vendor-specific payload into the common shape. */
  normalize(raw: unknown): Pick<NormalizedResult, 'status' | 'riskScore' | 'details'>;
}
