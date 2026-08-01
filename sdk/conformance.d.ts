export interface RulebookConformanceOptions {
  indexUrl?: string;
  endpoint?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface RulebookConformanceFixtureResult {
  id: string;
  ok: boolean;
  status?: number;
  expected_status?: number;
  application_verdict?: string | null;
  reason_code?: string | null;
  matched_rule_id?: string | null;
  errors: string[];
}

export interface RulebookConformanceResult {
  ok: boolean;
  conformance_version: string;
  index_url: string;
  endpoint: string;
  passed: number;
  failed: number;
  results: RulebookConformanceFixtureResult[];
}

export const DEFAULT_CONFORMANCE_ENDPOINT: string;
export const DEFAULT_CONFORMANCE_INDEX_URL: string;
export function runRulebookConformance(options?: RulebookConformanceOptions): Promise<RulebookConformanceResult>;
export function formatRulebookConformanceSummary(result: RulebookConformanceResult): string;
