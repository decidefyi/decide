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

export const DECISION_PROTOCOL_VERSION: string;
export const DECISION_RECORD_VERSION: string;
export const DECISION_PACKET_VERSION: string;
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
