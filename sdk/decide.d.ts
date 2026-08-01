export type DecisionResponseView = 'minimal' | 'standard' | 'full';

export interface DecideClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface DecideRequestOptions {
  idempotencyKey?: string;
  responseView?: DecisionResponseView;
}

export interface VerifyRecordOptions {
  record: Record<string, unknown>;
  input?: Record<string, unknown>;
  publicKey?: string;
}

export interface OutcomeRequestOptions {
  idempotencyKey?: string;
}

export interface ExecutionRequestOptions {
  idempotencyKey?: string;
}

export interface ListOutcomesOptions {
  limit?: number;
}

export interface ListExecutionsOptions {
  limit?: number;
}

export interface CrmSyncRequestOptions {
  idempotencyKey?: string;
}

export interface ListCrmSyncsOptions {
  limit?: number;
}

export interface PolicyEffectivenessOptions {
  policyVersion?: string;
  limit?: number;
  minSample?: number;
}

export interface PolicyAnomaliesOptions {
  policyVersion?: string;
  limit?: number;
  minSample?: number;
  threshold?: number;
  maxItems?: number;
}

export interface PolicyConfidenceOptions {
  policyVersion?: string;
  verdict?: string;
  action?: string;
  limit?: number;
  minSample?: number;
}

export interface PolicyBenchmarksOptions {
  policyVersion?: string;
  limit?: number;
  minCohortScopes?: number;
  minCohortDecisions?: number;
}

export interface DecisionChainOptions {
  limit?: number;
}

export interface DecisionPacketOptions {
  includeInput?: boolean;
  includeChain?: boolean;
  includeIntelligence?: boolean;
  executionLimit?: number;
  outcomeLimit?: number;
  policyLimit?: number;
  minSample?: number;
  threshold?: number;
  maxAnomalies?: number;
  chainLimit?: number;
}

export interface PolicyPatternsOptions {
  patternId?: string;
  tag?: string;
}

export interface RulebookMetadataOptions {
  hash?: string;
  rulebookId?: string;
  version?: string;
}

export interface TrustedAdapterInvocation {
  adapter_id: string;
  version: string;
  manifest_hash: string;
  input: Record<string, unknown>;
}

export interface TrustedAdapterDependency {
  manifest_version: 'trusted_adapter_manifest_v1';
  adapter_id: string;
  version: string;
  implementation_revision: string;
  implementation_hash: string;
  manifest_hash: string;
}

export interface TrustedAdapterAttestation extends TrustedAdapterDependency {
  input_hash: string;
  output_hash: string;
  execution_isolation: 'worker_thread_one_shot_v1';
  capability_enforcement: 'ambient_capability_deny_v2';
  execution_timeout_ms: number;
}

export type RuntimeBindingMode =
  | 'direct_declarative_rulebook'
  | 'trusted_adapter_facts_then_declarative_rulebook';

export interface RuntimeBinding {
  production_core: 'hybrid_declarative_rulebook_with_trusted_adapters';
  binding_mode: RuntimeBindingMode;
  verdict_authority: 'declarative_rulebook';
  adapter_authority?: 'facts_only';
  customer_supplied_code: 'rejected';
}

export interface DecisionRecord extends Record<string, unknown> {
  decision_id: string;
  request_id: string;
  decision: string;
  runtime_binding?: RuntimeBinding;
  trusted_adapter?: TrustedAdapterAttestation;
  record_hash?: string;
  receipt_hash?: string;
  action_binding?: Record<string, unknown>;
}

export interface RegistryAttestation {
  registry_attestation_version: 'decision_registry_attestation_v1';
  status: 'signed' | 'unsigned';
  attestation_hash: string;
  key_id?: string;
  signature_algorithm?: 'ed25519';
  signature?: string;
  public_key?: string;
  public_key_fingerprint?: string;
}

export interface RulebookRegistryMetadata {
  rulebook_registry_version: 'decision_rulebook_registry_v1';
  schema_version: 'rulebook_v1';
  rulebook_id: string;
  version: string;
  hash: string;
  evaluator_version: string;
  trusted_adapter?: TrustedAdapterDependency;
  hash_algorithm: 'sha256';
  canonicalization: 'json.sort_deep.v1';
  scope_hash: string;
  registry_attestation: RegistryAttestation;
  registered_at: string;
}

export interface VerificationOptions {
  input?: Record<string, unknown>;
  publicKey?: string;
  untrustedPublicKey?: string;
  hmacSecret?: string;
  env?: Record<string, string | undefined>;
}

export interface VerificationWithRegistryOptions extends VerificationOptions {
  record: Record<string, unknown>;
  keyRegistryUrl?: string;
  fetchImpl?: typeof fetch;
  keySource?: string;
}

export interface PacketVerificationWithRegistryOptions extends VerificationOptions {
  packet: Record<string, unknown>;
  keyRegistryUrl?: string;
  fetchImpl?: typeof fetch;
  keySource?: string;
}

export interface ApplicationBindingVerificationResult {
  ok: boolean;
  verified: boolean;
  contract_version: 'decide_application_binding_v1';
  required_decision_material: string[];
  accepted_fact_sources: string[];
  fact_source: 'context.inputs' | 'adapter_facts' | null;
  missing: string[];
  prohibited_claims: string[];
  checks: Record<string, boolean | null>;
  actual: Record<string, unknown>;
}

export interface VerificationResult {
  ok?: boolean;
  key_source?: string;
  verified: boolean;
  integrity_valid: boolean;
  authenticity_valid: boolean;
  checks: Record<string, boolean | null>;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  error?: string;
}

export class DecideClient {
  constructor(options?: DecideClientOptions);
  decide(input: Record<string, unknown>, options?: DecideRequestOptions): Promise<DecisionRecord>;
  verifyRecord(options: VerifyRecordOptions): Promise<Record<string, unknown>>;
  verifyDecision(decisionId: string): Promise<Record<string, unknown>>;
  lookupDecision(decisionId: string): Promise<Record<string, unknown>>;
  replayDecision(decisionId: string, body?: Record<string, unknown>): Promise<Record<string, unknown>>;
  diffDecision(decisionId: string, body?: Record<string, unknown>): Promise<Record<string, unknown>>;
  counterfactuals(decisionId: string, body?: Record<string, unknown>): Promise<Record<string, unknown>>;
  recordExecution(
    decisionId: string,
    body?: Record<string, unknown>,
    options?: ExecutionRequestOptions
  ): Promise<Record<string, unknown>>;
  listExecutions(decisionId: string, options?: ListExecutionsOptions): Promise<Record<string, unknown>>;
  recordOutcome(
    decisionId: string,
    body?: Record<string, unknown>,
    options?: OutcomeRequestOptions
  ): Promise<Record<string, unknown>>;
  listOutcomes(decisionId: string, options?: ListOutcomesOptions): Promise<Record<string, unknown>>;
  recordCrmSync(
    decisionId: string,
    body?: Record<string, unknown>,
    options?: CrmSyncRequestOptions
  ): Promise<Record<string, unknown>>;
  listCrmSyncs(decisionId: string, options?: ListCrmSyncsOptions): Promise<Record<string, unknown>>;
  policyEffectiveness(policyId: string, options?: PolicyEffectivenessOptions): Promise<Record<string, unknown>>;
  policyAnomalies(policyId: string, options?: PolicyAnomaliesOptions): Promise<Record<string, unknown>>;
  policyConfidence(policyId: string, options?: PolicyConfidenceOptions): Promise<Record<string, unknown>>;
  policyBenchmarks(policyId: string, options?: PolicyBenchmarksOptions): Promise<Record<string, unknown>>;
  decisionChain(chainId: string, options?: DecisionChainOptions): Promise<Record<string, unknown>>;
  decisionPacket(decisionId: string, options?: DecisionPacketOptions): Promise<Record<string, unknown>>;
  receiptKeys(): Promise<Record<string, unknown>>;
  policyBundles(): Promise<Record<string, unknown>>;
  rulebookMetadata(
    options: RulebookMetadataOptions
  ): Promise<{ ok: boolean; rulebook: RulebookRegistryMetadata }>;
  policyPatterns(options?: PolicyPatternsOptions): Promise<Record<string, unknown>>;
  status(): Promise<Record<string, unknown>>;
}

export function createDecideClient(options?: DecideClientOptions): DecideClient;
export const DECIDE_APPLICATION_BINDING_VERSION: 'decide_application_binding_v1';
export function canonicalJson(value: unknown): string;
export function sha256Hex(value: unknown): string;
export function computeRecordHash(record: Record<string, unknown>): string;
export function computeReceiptHash(record: Record<string, unknown>, recordHash: string): string;
export function computeExecutionHash(record: Record<string, unknown>): string;
export function computeOutcomeHash(record: Record<string, unknown>): string;
export function computeDecisionPacketHash(packet: Record<string, unknown>): string;
export function verifyApplicationBinding(source: Record<string, unknown>): ApplicationBindingVerificationResult;
export function verifyDecisionRecord(record: Record<string, unknown>, options?: VerificationOptions): VerificationResult;
export function verifyDecisionRecordWithRegistry(options: VerificationWithRegistryOptions): Promise<VerificationResult>;
export function verifyDecisionPacket(packet: Record<string, unknown>, options?: VerificationOptions): VerificationResult;
export function verifyDecisionPacketWithRegistry(options: PacketVerificationWithRegistryOptions): Promise<VerificationResult>;
export function fetchRegistryPublicKey(
  registryUrl: string,
  record: Record<string, unknown>,
  options?: { fetchImpl?: typeof fetch }
): Promise<string>;
