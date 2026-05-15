# Function Inventory + Interconnection Map

Generated: 2026-05-15 23:30:27 CEST

## Scope

This is the repo-local function and dependency map for `decide`.

Companion artifacts:

- [OUTBOUND_DOMAIN_INVENTORY.md](OUTBOUND_DOMAIN_INVENTORY.md)
- [OUTBOUND_URL_PARSE_ISSUES.md](OUTBOUND_URL_PARSE_ISSUES.md)

## Function Surface

### Scan targets

`api lib client scripts `

### Function declarations

```text
api/cancel-mcp.js:34:function formatTextMessage(payload) {
api/cancel-mcp.js:38:export default createMcpHandler({
api/compliance-export.js:18:export default async function complianceExportHandler(req, res) {
api/compliance-export.js:3:function sendJson(res, statusCode, payload) {
api/compliance-export.js:9:function readFormat(req) {
api/decide.js:100:function readGeminiText(data) {
api/decide.js:106:function sanitizeScore(n) {
api/decide.js:113:function sanitizeUnitScore(n) {
api/decide.js:125:function normalizeRisk(value, fallback = "medium") {
api/decide.js:131:function normalizeRuntimeCitations(citations) {
api/decide.js:164:function summarizeInputEvidenceValue(value) {
api/decide.js:175:function buildInputEvidenceSummary(inputs = {}) {
api/decide.js:182:function buildRuntimeFallbackEvidence(payload = {}, context = {}) {
api/decide.js:20:function rid() {
api/decide.js:248:function normalizeHeaderValue(value) {
api/decide.js:24:function normalize(s = "") {
api/decide.js:253:function readHeader(req, name = "") {
api/decide.js:264:function readApiToken(req) {
api/decide.js:276:function resolveGeminiModelLadder() {
api/decide.js:285:function shouldRetryGeminiModel(statusCode, payload) {
api/decide.js:28:function wantsAdvice(q) {
api/decide.js:293:async function requestGeminiGenerateContent({ apiKey, prompt, generationConfig, request_id }) {
api/decide.js:32:function isFinanceAdvice(q) {
api/decide.js:363:function safeEqualToken(left, right) {
api/decide.js:373:function parseFlag(value) {
api/decide.js:378:function readTrustedProxyContext(req) {
api/decide.js:38:function isMedicalAdvice(q) {
api/decide.js:404:function sendDecisionJson(res, statusCode, payload, lineageInput = {}) {
api/decide.js:420:export default async function handler(req, res) {
api/decide.js:44:function isLegalAdvice(q) {
api/decide.js:50:function parseMultiQuestion(raw = "") {
api/decide.js:69:function asObject(value, fallback = {}) {
api/decide.js:73:function toStringArray(value, maxLength = 8) {
api/decide.js:81:function extractJson(text = "") {
api/health.js:12:function inferServiceFromHost(host) {
api/health.js:3:function normalizeHost(req) {
api/health.js:51:export default function handler(req, res) {
api/mcp.js:39:function formatTextMessage(payload) {
api/mcp.js:43:export default createMcpHandler({
api/metrics.js:11:export default async function handler(req, res) {
api/metrics.js:5:function send(res, status, payload) {
api/policy-alerts.js:13:function send(res, statusCode, payload) {
api/policy-alerts.js:144:function toAlertObjectFromFeedEntry(entry = {}, fallbackStatus = "confirmed") {
api/policy-alerts.js:189:function buildSuccessPayload({
api/policy-alerts.js:19:function readQueryValue(req, key, fallback = "") {
api/policy-alerts.js:215:function filterByDateRange(alerts = [], dateFrom = "", dateTo = "") {
api/policy-alerts.js:225:function sortAlertsNewest(alerts = []) {
api/policy-alerts.js:233:function filterByIncludeZero(alerts = [], includeZero = true) {
api/policy-alerts.js:238:function loadAlertsFromFiles({ state = "confirmed", dateFrom = "", dateTo = "", limit = 20, includeZero = true } = {}) {
api/policy-alerts.js:25:function readJson(filePath, fallback = {}) {
api/policy-alerts.js:265:async function loadAlertsFromSupabase({
api/policy-alerts.js:318:export default async function handler(req, res) {
api/policy-alerts.js:34:function parseLimit(rawValue, fallback = 20) {
api/policy-alerts.js:40:function parseIncludeZero(rawValue, fallback = true) {
api/policy-alerts.js:48:function parseBooleanFlag(rawValue, fallback = false) {
api/policy-alerts.js:56:function toNumber(value, fallback = 0) {
api/policy-alerts.js:61:function resolveStatusAndState({ status = "", state = "", strictEligible = true } = {}) {
api/policy-alerts.js:69:function resolveStrictEligible(value, status = "", state = "") {
api/policy-alerts.js:76:function normalizeState(value = "") {
api/policy-alerts.js:83:function normalizeDateOnly(value = "") {
api/policy-alerts.js:89:function defaultAllowFileFallback(env = process.env) {
api/policy-alerts.js:94:function toAlertObjectFromDailyRow(row = {}) {
api/policy-fetch-hook.js:101:function toLimitedText(value) {
api/policy-fetch-hook.js:108:async function fetchTextOnce(url, timeoutMs, userAgent, method = "GET") {
api/policy-fetch-hook.js:14:function normalizeHeaderValue(value) {
api/policy-fetch-hook.js:159:async function fetchViaBrowserless(targetUrl, timeoutMs) {
api/policy-fetch-hook.js:19:function readHeader(req, name = "") {
api/policy-fetch-hook.js:216:async function fetchViaDirect(targetUrl, timeoutMs) {
api/policy-fetch-hook.js:227:async function fetchViaJinaMirror(targetUrl, timeoutMs) {
api/policy-fetch-hook.js:238:export default async function handler(req, res) {
api/policy-fetch-hook.js:30:function readBearerToken(req) {
api/policy-fetch-hook.js:39:function readInboundHookToken(req) {
api/policy-fetch-hook.js:43:function safeEqualToken(left, right) {
api/policy-fetch-hook.js:53:function sendJson(res, statusCode, payload) {
api/policy-fetch-hook.js:59:function clampTimeout(value) {
api/policy-fetch-hook.js:65:function parseBody(req) {
api/policy-fetch-hook.js:78:function parseAllowlist(value) {
api/policy-fetch-hook.js:85:function isHostAllowed(hostname, allowlist) {
api/policy-fetch-hook.js:92:function toJinaMirrorUrl(url) {
api/return-mcp.js:39:function formatTextMessage(payload) {
api/return-mcp.js:43:export default createMcpHandler({
api/track.js:113:export default async function handler(req, res) {
api/track.js:34:function send(res, status, payload) {
api/track.js:40:async function readJson(req) {
api/track.js:50:function getAllowedOriginsFromEnv() {
api/track.js:61:function parseOrigin(rawOrigin) {
api/track.js:70:function isAllowedOrigin(rawOrigin) {
api/track.js:83:function isAllowedEvent(event) {
api/track.js:89:function sanitizeProps(rawProps) {
api/trial-mcp.js:34:function formatTextMessage(payload) {
api/trial-mcp.js:38:export default createMcpHandler({
api/v1/[policy]/[action].js:13:function first(value) {
api/v1/[policy]/[action].js:17:function normalize(value) {
api/v1/[policy]/[action].js:21:function readPathParam(req, key, pathIndex) {
api/v1/[policy]/[action].js:30:function json(res, statusCode, payload) {
api/v1/[policy]/[action].js:36:export default async function v1PolicyDispatcher(req, res) {
api/v1/workflows/zendesk/[workflow].js:13:function first(value) {
api/v1/workflows/zendesk/[workflow].js:17:function normalize(value) {
api/v1/workflows/zendesk/[workflow].js:21:function readWorkflowParam(req) {
api/v1/workflows/zendesk/[workflow].js:30:function json(res, statusCode, payload) {
api/v1/workflows/zendesk/[workflow].js:36:export default async function zendeskWorkflowDispatcher(req, res) {
client/refund-auditor.js:28:async function checkRefundEligibility(vendor, daysSincePurchase) {
lib/cancel-compute.js:164:export function getSupportedVendors() {
lib/cancel-compute.js:171:export function getRulesVersion() {
lib/cancel-compute.js:22:function withSource(result, vendor) {
lib/cancel-compute.js:37:export function validateInput({ vendor, region, plan }) {
lib/cancel-compute.js:73:export function compute({ vendor, region, plan }) {
lib/compliance-export.js:109:function escapeCsv(value) {
lib/compliance-export.js:115:function toCsv(rows) {
lib/compliance-export.js:119:export function buildComplianceSnapshot(now = new Date()) {
lib/compliance-export.js:187:export function snapshotToCsv(snapshot) {
lib/compliance-export.js:50:function readJson(filePath, fallback = {}) {
lib/compliance-export.js:59:function asObject(value) {
lib/compliance-export.js:63:function asText(value) {
lib/compliance-export.js:67:function normalizeSource(entry) {
lib/compliance-export.js:80:function normalizeCandidate(entry) {
lib/compliance-export.js:94:function loadPolicySet(config) {
lib/lineage.js:15:export function buildSourceHash(payload) {
lib/lineage.js:20:export function withLineage(payload, { policyVersion = "unknown", sourceHash = "unknown", evaluatedAt } = {}) {
lib/lineage.js:3:function toIso(value = new Date()) {
lib/lineage.js:8:function stableStringify(value) {
lib/log.js:3:export async function persistLog(event, data) {
lib/mcp-handler.js:12:async function readJson(req) {
lib/mcp-handler.js:23:function ok(id, result) {
lib/mcp-handler.js:27:function err(id, code, message, data) {
lib/mcp-handler.js:31:function defaultIsError(payload) {
lib/mcp-handler.js:35:export function createMcpHandler(config) {
lib/mcp-handler.js:52:  return async function mcpHandler(req, res) {
lib/mcp-handler.js:6:function send(res, status, payload) {
lib/metrics-axiom.js:10:function parseAxiomRows(payload) {
lib/metrics-axiom.js:1:function toUnixSeconds(ms) {
lib/metrics-axiom.js:27:export async function getAxiomMetricsSnapshot() {
lib/metrics-axiom.js:5:function safeNumber(value) {
lib/metrics-store.js:18:export function recordClientEvent(eventName, ts = Date.now()) {
lib/metrics-store.js:33:export function recordVendorRequest(vendorName, ts = Date.now()) {
lib/metrics-store.js:46:export function getMetricsSnapshot() {
lib/metrics-store.js:5:function getStore() {
lib/policy-supabase.js:107:export async function supabaseUpsertRows(config, tableName, rows = [], onConflictColumns = []) {
lib/policy-supabase.js:13:export function getPolicySupabaseConfig(env = process.env) {
lib/policy-supabase.js:1:function toFlag(value, fallback = false) {
lib/policy-supabase.js:31:function buildUrl(baseUrl, path, params = {}) {
lib/policy-supabase.js:47:function buildHeaders(config, { json = true, prefer = "" } = {}) {
lib/policy-supabase.js:61:export async function supabaseRestRequest(config, { method = "GET", path = "", params = {}, body, prefer = "" } = {}) {
lib/policy-supabase.js:7:function normalizeUrl(value = "") {
lib/rate-limit.js:108:export function addRateLimitHeaders(res, result) {
lib/rate-limit.js:11:export function createRateLimiter(requests, window) {
lib/rate-limit.js:16:  return function checkRateLimit(identifier) {
lib/rate-limit.js:74:export function getClientIp(req) {
lib/rate-limit.js:86:export function sendRateLimitError(res, result, request_id) {
lib/refund-compute.js:107:export function compute({ vendor, days_since_purchase, region, plan }) {
lib/refund-compute.js:186:export function getSupportedVendors() {
lib/refund-compute.js:193:export function getRulesVersion() {
lib/refund-compute.js:22:function withSource(result, vendor) {
lib/refund-compute.js:37:export function validateInput({ vendor, days_since_purchase, region, plan }) {
lib/return-compute.js:106:export function compute({ vendor, days_since_purchase, region, plan }) {
lib/return-compute.js:198:export function getSupportedVendors() {
lib/return-compute.js:205:export function getRulesVersion() {
lib/return-compute.js:22:function withSource(result, vendor) {
lib/return-compute.js:37:export function validateInput({ vendor, days_since_purchase, region, plan }) {
lib/routes/v1/policies/cancel-penalty.js:17:function rid() {
lib/routes/v1/policies/cancel-penalty.js:21:async function readJson(req) {
lib/routes/v1/policies/cancel-penalty.js:32:export default async function handler(req, res) {
lib/routes/v1/policies/cancel-penalty.js:7:function json(res, statusCode, payload) {
lib/routes/v1/policies/refund-eligibility.js:18:function rid() {
lib/routes/v1/policies/refund-eligibility.js:23:function isProbablyYou(req) {
lib/routes/v1/policies/refund-eligibility.js:28:async function readJson(req) {
lib/routes/v1/policies/refund-eligibility.js:39:export default async function handler(req, res) {
lib/routes/v1/policies/refund-eligibility.js:8:function json(res, statusCode, payload) {
lib/routes/v1/policies/return-eligibility.js:17:function rid() {
lib/routes/v1/policies/return-eligibility.js:21:async function readJson(req) {
lib/routes/v1/policies/return-eligibility.js:32:export default async function handler(req, res) {
lib/routes/v1/policies/return-eligibility.js:7:function json(res, statusCode, payload) {
lib/routes/v1/policies/trial-terms.js:17:function rid() {
lib/routes/v1/policies/trial-terms.js:21:async function readJson(req) {
lib/routes/v1/policies/trial-terms.js:32:export default async function handler(req, res) {
lib/routes/v1/policies/trial-terms.js:7:function json(res, statusCode, payload) {
lib/routes/v1/workflows/zendesk/cancel.js:32:export default createZendeskWorkflowHandler({
lib/routes/v1/workflows/zendesk/cancel.js:4:function buildAction({ decisionClass, policy }) {
lib/routes/v1/workflows/zendesk/refund.js:28:export default createZendeskWorkflowHandler({
lib/routes/v1/workflows/zendesk/refund.js:4:function buildAction({ decisionClass, policy }) {
lib/routes/v1/workflows/zendesk/return.js:28:export default createZendeskWorkflowHandler({
lib/routes/v1/workflows/zendesk/return.js:4:function buildAction({ decisionClass, policy }) {
lib/routes/v1/workflows/zendesk/trial.js:28:export default createZendeskWorkflowHandler({
lib/routes/v1/workflows/zendesk/trial.js:4:function buildAction({ decisionClass, policy }) {
lib/routes/v1/workflows/zendesk/workflow-common.js:107:async function invokeJson(handler, reqOptions) {
lib/routes/v1/workflows/zendesk/workflow-common.js:118:function buildZendeskTags({
lib/routes/v1/workflows/zendesk/workflow-common.js:11:function json(res, statusCode, payload) {
lib/routes/v1/workflows/zendesk/workflow-common.js:143:function buildPrivateNote({
lib/routes/v1/workflows/zendesk/workflow-common.js:176:export function createZendeskWorkflowHandler(config) {
lib/routes/v1/workflows/zendesk/workflow-common.js:197:  function pruneIdempotencyCache(now) {
lib/routes/v1/workflows/zendesk/workflow-common.js:205:  return async function zendeskWorkflowHandler(req, res) {
lib/routes/v1/workflows/zendesk/workflow-common.js:21:async function readJson(req) {
lib/routes/v1/workflows/zendesk/workflow-common.js:32:function normalizeText(value, maxLen = 500) {
lib/routes/v1/workflows/zendesk/workflow-common.js:37:function normalizeDecision(value) {
lib/routes/v1/workflows/zendesk/workflow-common.js:43:function buildDecideAuthHeaders() {
lib/routes/v1/workflows/zendesk/workflow-common.js:52:function parseDays(value) {
lib/routes/v1/workflows/zendesk/workflow-common.js:58:function buildIdempotencyKey(payload) {
lib/routes/v1/workflows/zendesk/workflow-common.js:70:function createReq({
lib/routes/v1/workflows/zendesk/workflow-common.js:7:function rid() {
lib/routes/v1/workflows/zendesk/workflow-common.js:93:function createRes() {
lib/trial-compute.js:142:export function getSupportedVendors() {
lib/trial-compute.js:149:export function getRulesVersion() {
lib/trial-compute.js:22:function withSource(result, vendor) {
lib/trial-compute.js:37:export function validateInput({ vendor, region, plan }) {
lib/trial-compute.js:73:export function compute({ vendor, region, plan }) {
scripts/check-policies.js:1007:function writeWeeklyTriageReports(rows, generatedAtUtc) {
scripts/check-policies.js:1032:  const delta = (key) => {
scripts/check-policies.js:1076:function readNdjson(filePath) {
scripts/check-policies.js:1096:function toArtifactAbsolutePath(artifactPath = "") {
scripts/check-policies.js:1100:async function hydratePolicyStateArtifactsFromSupabase(supabaseConfig) {
scripts/check-policies.js:1158:async function syncPolicyStateArtifactsToSupabase(supabaseConfig) {
scripts/check-policies.js:1204:function buildSupabasePolicyEventRows(eventLogEntries = [], dateUtc = "") {
scripts/check-policies.js:1235:function buildSupabaseDailyAlertRow(entry = {}, strictEligible = false) {
scripts/check-policies.js:1273:function getAlertContinuityLookbackDays() {
scripts/check-policies.js:1279:function listDateRangeUtc(startDateUtc = "", endDateUtc = "") {
scripts/check-policies.js:1293:async function fetchSupabaseDailyAlertDateSet(supabaseConfig, startDateUtc = "", endDateUtc = "") {
scripts/check-policies.js:1317:function buildSupabaseZeroChangeContinuityRow(dateUtc = "", templateEntry = {}) {
scripts/check-policies.js:1359:async function buildSupabaseContinuityBackfillRows({
scripts/check-policies.js:1383:async function syncPolicyAlertsToSupabase({
scripts/check-policies.js:1433:function buildPolicyEventId(item) {
scripts/check-policies.js:1441:function appendPolicyEventLog(changedItems, generatedAtUtc = utcIsoTimestamp()) {
scripts/check-policies.js:1507:function updateJsonStringField(filePath, fieldName, nextValue) {
scripts/check-policies.js:1522:export function normalizeSourceUrlForComparison(value) {
scripts/check-policies.js:1550:function firstNonEmptyString(values = []) {
scripts/check-policies.js:1557:export function evaluateVendorSourceMigration({
scripts/check-policies.js:1598:function detectFetchInterstitial(text) {
scripts/check-policies.js:1618:function normalizeFetchFailureReasonToken(errorMessage) {
scripts/check-policies.js:1627:function parseFetchFailureSegments(failureReason) {
scripts/check-policies.js:1647:function isImmediateFetchBlockErrorMessage(errorMessage) {
scripts/check-policies.js:1654:function isAuxiliaryFetchFailureSegment(segment) {
scripts/check-policies.js:1661:export function classifyFetchFailureBlock(failureReason) {
scripts/check-policies.js:1695:export function getCandidatePendingModelId(candidate) {
scripts/check-policies.js:1703:export function isLegacyPendingCandidate(candidate) {
scripts/check-policies.js:1707:function getPendingModelFirstObservedUtc(candidate, fallback = "") {
scripts/check-policies.js:1714:function markCandidatePendingModel(candidate, firstObservedUtc) {
scripts/check-policies.js:1722:function decodeHtmlEntities(input) {
scripts/check-policies.js:1734:function escapeRegexLiteral(value) {
scripts/check-policies.js:1738:function getPolicyKeywordRegex(policyType) {
scripts/check-policies.js:1750:function getPolicyKeywords(policyType) {
scripts/check-policies.js:1757:function getVendorKeywordRegex(vendorKey) {
scripts/check-policies.js:1768:function extractVendorStableText(lines, vendorKey) {
scripts/check-policies.js:1788:function extractPolicyFocusedText(lines, policyType) {
scripts/check-policies.js:1811:function normalizeFetchedText(rawText, policyType = "default", vendorKey = "") {
scripts/check-policies.js:1849:function getFetchQualityMinChars() {
scripts/check-policies.js:1854:function getFetchQualityMinLines() {
scripts/check-policies.js:1859:function getFetchQualityMinPolicyHits() {
scripts/check-policies.js:1864:function getQualityGateRejectFailures() {
scripts/check-policies.js:1869:function getFetchQualityThresholds(policyType, vendorKey) {
scripts/check-policies.js:1892:function countPolicyKeywordHits(text, policyType) {
scripts/check-policies.js:1905:function assessFetchQuality({ rawText, normalizedText, policyType, vendorKey = "" }) {
scripts/check-policies.js:1941:function scoreFetchQuality(quality) {
scripts/check-policies.js:1954:function normalizePageMetadata(input = {}) {
scripts/check-policies.js:1974:function toIsoDateOnly(value) {
scripts/check-policies.js:1982:function buildPageMetadataSignature(input) {
scripts/check-policies.js:2003:function extractMetadataText(rawText) {
scripts/check-policies.js:2015:function extractDateLabelFromText(text, labelPattern) {
scripts/check-policies.js:2023:function extractTitleFromText(rawText) {
scripts/check-policies.js:2039:function extractPageMetadata({ rawText, sourceMetadata } = {}) {
scripts/check-policies.js:2064:function normalizeSemanticTokens(tokens) {
scripts/check-policies.js:2072:function semanticTokenSignature(profile) {
scripts/check-policies.js:2077:export function semanticSignaturesStable(previousSignature, nextSignature) {
scripts/check-policies.js:2084:export function buildChangeKey(hashValue, semanticSignature) {
scripts/check-policies.js:2091:function getCandidateChangeKey(candidate, fallback = {}) {
scripts/check-policies.js:2113:function getCandidateSignalWindowDecision(candidate) {
scripts/check-policies.js:2123:function extractDurationTokens(text, anchors = [], tokenPrefix = "window_days") {
scripts/check-policies.js:2151:function extractSemanticTokens(text, policyType = "default") {
scripts/check-policies.js:2156:  const addIfMatch = (token, regex) => {
scripts/check-policies.js:2217:function buildSemanticProfile(text, policyType, metadata = {}) {
scripts/check-policies.js:2236:function normalizeSemanticProfile(input, metadata = {}) {
scripts/check-policies.js:2259:function normalizeConfirmedBaselineEntry(input) {
scripts/check-policies.js:2279:function semanticTokensFromSignature(signature) {
scripts/check-policies.js:2286:function buildComparisonSemanticProfile({ baselineEntry, fallbackProfile }) {
scripts/check-policies.js:2315:function diffSemanticProfiles(previousProfile, nextProfile) {
scripts/check-policies.js:2339:function formatSemanticDiffSummary(semanticDiff) {
scripts/check-policies.js:2349:function buildSemanticDiffSignature(semanticDiff) {
scripts/check-policies.js:2356:function getActualConfirmRuns() {
scripts/check-policies.js:2361:function getActualConfirmRunsForVendor(vendorConfig, vendor, sourceVolatilityTier = "normal") {
scripts/check-policies.js:2383:function getActualMinGapMs() {
scripts/check-policies.js:2389:function getActualMinGapHours() {
scripts/check-policies.js:2394:function getCandidateTtlDays() {
scripts/check-policies.js:2399:function getPendingDetailLimit() {
scripts/check-policies.js:2404:function getSameRunRecheckPasses() {
scripts/check-policies.js:2409:function getSameRunRecheckDelayMs() {
scripts/check-policies.js:2414:function getSameRunRecheckBatchSize(defaultSize = 3) {
scripts/check-policies.js:2419:function getSameRunMajorityMinVotes() {
scripts/check-policies.js:2424:function getCrossRunWindowSize() {
scripts/check-policies.js:2429:function getCrossRunWindowRequired() {
scripts/check-policies.js:2437:function getAdaptiveWindowEnabled() {
scripts/check-policies.js:2443:function getHighSignalWindowRequired() {
scripts/check-policies.js:2451:function getHighSignalMinPolicyHits() {
scripts/check-policies.js:2456:function getHighSignalMinLines() {
scripts/check-policies.js:2461:export function isHighSignalWindowCandidate({ semanticSignature, quality }) {
scripts/check-policies.js:2471:export function getCrossRunWindowRequiredForCandidate({ semanticSignature, quality }) {
scripts/check-policies.js:2478:function getCrossRunWindowRequirementLabel() {
scripts/check-policies.js:2486:function getStalePendingDays() {
scripts/check-policies.js:2491:function getVolatileFlipThreshold() {
scripts/check-policies.js:2496:function getVolatileRequireRecentFlip() {
scripts/check-policies.js:2502:function getEscalationPendingDays() {
scripts/check-policies.js:2507:function getEscalationFlipThreshold() {
scripts/check-policies.js:2512:function getEscalationRequireRecentFlip() {
scripts/check-policies.js:2518:function getFetchFailureQuarantineStreak() {
scripts/check-policies.js:2523:function getFallbackSignalConsecutiveRuns() {
scripts/check-policies.js:2528:function getEscalationFlipThresholdForVendor(policyName, vendor, sourceVolatilityTier = "normal") {
scripts/check-policies.js:2551:export function getVolatileFlipThresholdForVendor(policyName, vendor, sourceVolatilityTier = "normal") {
scripts/check-policies.js:2574:function getNoConfirmEscalationDays() {
scripts/check-policies.js:2579:function getMaterialCooldownDays() {
scripts/check-policies.js:2584:function getMaterialOscillationWindowDays() {
scripts/check-policies.js:2589:function getCandidatePendingSinceUtc(candidate) {
scripts/check-policies.js:2600:function getCandidateAgeDays(candidate, nowMs = Date.now()) {
scripts/check-policies.js:2608:function toMsOrNaN(isoValue) {
scripts/check-policies.js:2613:function appendSignalWindow(coverageEntry, signal) {
scripts/check-policies.js:2626:export function countSignalWindowChangeFlips(signalWindow) {
scripts/check-policies.js:2642:export function evaluateSignalWindow(signalWindow, requiredVotes = getCrossRunWindowRequired()) {
scripts/check-policies.js:2676:function getRunMajorityDecision(observations) {
scripts/check-policies.js:2713:function sortedLimitedVendors(vendors, limit = getPendingDetailLimit()) {
scripts/check-policies.js:2718:function isStaleCandidate(candidate, nowMs = Date.now()) {
scripts/check-policies.js:2731:async function fetchText(url, attempts = 3) {
scripts/check-policies.js:2770:function normalizeFallbackProbeHeaderValue(value) {
scripts/check-policies.js:2774:function getFallbackProbeHeader(headers, key) {
scripts/check-policies.js:2779:function buildFallbackProbeEntrySignatures(entry) {
scripts/check-policies.js:2810:export function evaluateFallbackSignalTransition({
scripts/check-policies.js:2859:async function probeHeadMetadata(url, attempts = 2) {
scripts/check-policies.js:2923:async function probeFallbackMetadata(vendorConfig) {
scripts/check-policies.js:2996:async function fetchBrowserHookText({ url, vendor, policyType }, attempts = 1) {
scripts/check-policies.js:3079:function toJinaMirrorUrl(url) {
scripts/check-policies.js:3088:export function toZendeskHelpCenterApiTarget(url) {
scripts/check-policies.js:3119:async function fetchZendeskHelpCenterJson(apiTarget, attempts = 2) {
scripts/check-policies.js:3215:function buildCandidateUrls(vendorConfig) {
scripts/check-policies.js:3233:async function attemptFetchLane({ lane, candidateUrl, context }) {
scripts/check-policies.js:327:function hash(text) {
scripts/check-policies.js:3309:async function fetchWithFallback(vendorConfig, context = {}) {
scripts/check-policies.js:331:function sha256Hex(text = "") {
scripts/check-policies.js:335:function readJson(filePath, fallback = {}) {
scripts/check-policies.js:3392:async function checkPolicySet({
scripts/check-policies.js:344:function sleep(ms) {
scripts/check-policies.js:348:function jitter(ms) {
scripts/check-policies.js:354:function normalizeFetchLane(value) {
scripts/check-policies.js:3579:  const ensureCoverageEntry = (vendor) => {
scripts/check-policies.js:3586:  const markSuccessfulFetch = (vendor, whenUtc, fetchLane = "") => {
scripts/check-policies.js:358:function normalizeFetchLaneList(values) {
scripts/check-policies.js:3594:  const markConfirmedChange = (vendor, whenUtc) => {
scripts/check-policies.js:3599:  const getConfiguredSourceUrl = (vendorConfig) => {
scripts/check-policies.js:3609:  const getVendorVolatilityTier = (vendorConfig, sourceUrl = "") => {
scripts/check-policies.js:3645:  const clearBlockedRetryQueueEntry = (vendor) => {
scripts/check-policies.js:371:function parseFetchLaneCsv(value) {
scripts/check-policies.js:375:function getDefaultFetchLanes() {
scripts/check-policies.js:384:function getVendorFetchLanes(vendorConfig) {
scripts/check-policies.js:390:function normalizeTier1VendorList(value) {
scripts/check-policies.js:403:function loadTier1VendorsConfig() {
scripts/check-policies.js:413:function getTier1TargetForPolicy(policyType, availableVendors, tier1Config) {
scripts/check-policies.js:423:function utcIsoTimestamp(date = new Date()) {
scripts/check-policies.js:427:function parseDateOnlyToUtc(value = "") {
scripts/check-policies.js:435:function toDateOnlyUtc(date = new Date()) {
scripts/check-policies.js:439:function addUtcDays(value = "", days = 0) {
scripts/check-policies.js:446:function toZeroPolicyCounts() {
scripts/check-policies.js:450:function buildZeroChangeContinuityAlert(dateUtc = "") {
scripts/check-policies.js:495:function summarizePolicyCounts(changedItems) {
scripts/check-policies.js:504:function toPolicyCountObject(changedItems) {
scripts/check-policies.js:514:function getPolicyAlertFeedMaxEntries() {
scripts/check-policies.js:5190:async function main() {
scripts/check-policies.js:520:function getPolicyAlertIncludeZeroChange() {
scripts/check-policies.js:525:function buildRunUrl() {
scripts/check-policies.js:532:function sortAlertsByGeneratedUtcDesc(alerts = []) {
scripts/check-policies.js:540:function removeAlertsForDate(alerts = [], dateUtc = "") {
scripts/check-policies.js:546:function upsertDailyAlert(alerts = [], dailyEntry = {}, maxEntries = 120) {
scripts/check-policies.js:553:function collapseAlertsByDate(alerts = []) {
scripts/check-policies.js:5544:  const toPolicyCountString = (items) => Object.entries(summarizePolicyCounts(items))
scripts/check-policies.js:566:function ensureAlertDateContinuity(alerts = [], maxEntries = 120) {
scripts/check-policies.js:592:function toDateUtcPrefix(value = "") {
scripts/check-policies.js:598:function normalizeSourceHostname(value = "") {
scripts/check-policies.js:608:function normalizeVolatilityTier(value = "") {
scripts/check-policies.js:614:function inferSourceVolatilityTier(sourceUrl = "") {
scripts/check-policies.js:637:function getSourceVolatilityRule(tier = "normal") {
scripts/check-policies.js:642:export function resolveSourceVolatilityTier(vendorConfig, sourceUrl = "") {
scripts/check-policies.js:650:function normalizeDailyFingerprintEntry(input) {
scripts/check-policies.js:678:function normalizeBlockedRetryEntry(input) {
scripts/check-policies.js:718:function buildComparisonBaselineEntry({ baselineEntry, dailyFingerprintEntry }) {
scripts/check-policies.js:736:function buildDailyPolicyCountsFromEvents(dayEvents = []) {
scripts/check-policies.js:746:function buildDailyAlertFromEvents(entry = {}, eventLogEntries = []) {
scripts/check-policies.js:789:function isStrictDailyAlertEntry(entry = {}, { includeZeroChange = true } = {}) {
scripts/check-policies.js:796:function updatePolicyAlertFeed(entry, eventLogEntries = [], { includeZeroChange = true } = {}) {
scripts/check-policies.js:882:function summarizeStatusCounts(rows) {
scripts/check-policies.js:891:function summarizePolicyStatusCounts(rows, statuses = []) {
scripts/check-policies.js:904:function writePolicyStatusReports(rows, generatedAtUtc) {
scripts/check-policies.js:966:function toIsoWeekKey(utcIso) {
scripts/check-policies.js:979:function buildWeeklyTriageSnapshot(rows, generatedAtUtc) {
scripts/customer-key-smoke.js:104:async function main() {
scripts/customer-key-smoke.js:27:function parseArgs(argv) {
scripts/customer-key-smoke.js:58:function normalizeBaseUrl(value) {
scripts/customer-key-smoke.js:68:function redactKey(key) {
scripts/customer-key-smoke.js:74:async function postJson(url, { key, question, timeoutMs }) {
scripts/customer-key-smoke.js:8:function usage() {
scripts/generate-outbound-domain-inventory.mjs:103:function inferTags(host, ownSuffixes) {
scripts/generate-outbound-domain-inventory.mjs:141:function riskTier(tags, contexts) {
scripts/generate-outbound-domain-inventory.mjs:172:function isCriticalDomain(tags) {
scripts/generate-outbound-domain-inventory.mjs:176:function asSorted(setLike) {
scripts/generate-outbound-domain-inventory.mjs:180:function sampleRefs(entry, maxItems = 3) {
scripts/generate-outbound-domain-inventory.mjs:187:function trimCell(value) {
scripts/generate-outbound-domain-inventory.mjs:191:function renderTableRow(cells) {
scripts/generate-outbound-domain-inventory.mjs:195:function compareAscii(a, b) {
scripts/generate-outbound-domain-inventory.mjs:201:function buildIssuesMarkdown({ timestamp, issues, rawLineCount }) {
scripts/generate-outbound-domain-inventory.mjs:230:function buildInventoryMarkdown({ timestamp, summary, topByOccurrences, criticalHosts, hosts, repo }) {
scripts/generate-outbound-domain-inventory.mjs:310:function main() {
scripts/generate-outbound-domain-inventory.mjs:56:function firstPartySuffixes(repo) {
scripts/generate-outbound-domain-inventory.mjs:64:function cleanUrl(rawUrl) {
scripts/generate-outbound-domain-inventory.mjs:6:function parseArgs(argv) {
scripts/generate-outbound-domain-inventory.mjs:72:function splitCombinedUrls(rawUrl) {
scripts/generate-outbound-domain-inventory.mjs:79:function normalizeHost(hostname) {
scripts/generate-outbound-domain-inventory.mjs:88:function inferContexts(filePath) {
scripts/generate-project-inventory.sh:11:FUNC_PATTERN='export default|export async function|export function|function [A-Za-z0-9_]+\(|const [A-Za-z0-9_]+\s*=\s*\([^)]*\)\s*=>|const [A-Za-z0-9_]+\s*=\s*async\s*\([^)]*\)\s*=>'
scripts/lib/policy-feed-reliability.js:100:export function mergePolicyAlertFeed({
scripts/lib/policy-feed-reliability.js:13:function normalizeByPolicy(byPolicyValue) {
scripts/lib/policy-feed-reliability.js:23:function buildByPolicySignature(byPolicy) {
scripts/lib/policy-feed-reliability.js:29:export function normalizeAlertEntry(entry) {
scripts/lib/policy-feed-reliability.js:56:export function buildAlertSignature(entry) {
scripts/lib/policy-feed-reliability.js:76:export function isLowSignalAlert(entry, { lowSignalThreshold = DEFAULT_LOW_SIGNAL_THRESHOLD } = {}) {
scripts/lib/policy-feed-reliability.js:7:function toNonNegativeInt(value, fallback = 0) {
scripts/lib/policy-feed-reliability.js:86:function dedupeAlerts(alerts) {
scripts/site-bridge-regression.js:13:function assert(condition, message) {
scripts/site-bridge-regression.js:17:function pass(message) {
scripts/site-bridge-regression.js:9:function read(relativePath) {
scripts/smoke-test.js:12:function createReq({
scripts/smoke-test.js:35:function createRes() {
scripts/smoke-test.js:49:function parseJson(label, body) {
scripts/smoke-test.js:57:async function runCase(label, handler, reqOptions, assertFn) {
scripts/smoke-test.js:66:function expect(condition, message) {
scripts/smoke-test.js:72:async function main() {
scripts/test-check-policies.js:107:function testCurrentPendingModelStaysActive() {
scripts/test-check-policies.js:117:function testZendeskApiTargetForArticle() {
scripts/test-check-policies.js:128:function testZendeskApiTargetForSection() {
scripts/test-check-policies.js:139:function testZendeskApiTargetRejectsUnsupportedPaths() {
scripts/test-check-policies.js:144:function testSemanticSignaturesStableForEmptyTokens() {
scripts/test-check-policies.js:152:function testSemanticSignaturesStableForMatchingNonEmptyTokens() {
scripts/test-check-policies.js:160:function testSemanticSignaturesStableRejectsMixedOrDifferentTokens() {
scripts/test-check-policies.js:173:function testBuildChangeKeyPrefersSemanticSignature() {
scripts/test-check-policies.js:178:function testBuildChangeKeyFallsBackToHash() {
scripts/test-check-policies.js:183:function testBuildChangeKeyHandlesMissingValues() {
scripts/test-check-policies.js:188:function testHighSignalWindowCandidateDetection() {
scripts/test-check-policies.js:209:function testAdaptiveWindowRequiredForCandidate() {
scripts/test-check-policies.js:232:function testEvaluateSignalWindowSupportsRequiredOverride() {
scripts/test-check-policies.js:243:function testCountSignalWindowChangeFlips() {
scripts/test-check-policies.js:256:function testVolatileFlipThresholdOverrides() {
scripts/test-check-policies.js:25:function envInt(name, fallback) {
scripts/test-check-policies.js:269:function testSourceVolatilityTierResolution() {
scripts/test-check-policies.js:289:function testVolatileFlipThresholdIncludesFlakyTierDelta() {
scripts/test-check-policies.js:307:function testFallbackSignalTransitionRequiresStrongSignatures() {
scripts/test-check-policies.js:31:function configuredCrossRunWindowSize() {
scripts/test-check-policies.js:336:function testFallbackSignalTransitionStableSignatureResetsConsecutiveRuns() {
scripts/test-check-policies.js:355:function testFallbackSignalTransitionActionableThreshold() {
scripts/test-check-policies.js:35:function configuredDefaultWindowRequired() {
scripts/test-check-policies.js:378:function testNormalizeSourceUrlForComparisonCanonicalizesTrivialDifferences() {
scripts/test-check-policies.js:384:function testEvaluateVendorSourceMigrationDetectsPrimaryUrlChanges() {
scripts/test-check-policies.js:393:function testEvaluateVendorSourceMigrationSkipsStableOrMissingSources() {
scripts/test-check-policies.js:40:function configuredHighSignalWindowRequired() {
scripts/test-check-policies.js:412:function main() {
scripts/test-check-policies.js:45:function configuredHighSignalMinPolicyHits() {
scripts/test-check-policies.js:49:function configuredHighSignalMinLines() {
scripts/test-check-policies.js:53:function testImmediateBlockOnCloudflareAnd403() {
scripts/test-check-policies.js:66:function testImmediateBlockAllowsZendesk404AsAuxiliary() {
scripts/test-check-policies.js:79:function testTransientFailureDoesNotImmediateBlock() {
scripts/test-check-policies.js:91:function testPlain403StillImmediateBlocks() {
scripts/test-check-policies.js:98:function testLegacyPendingModelDefaults() {
scripts/test-decision-contract.js:117:async function testDecideRuntimeFixture() {
scripts/test-decision-contract.js:16:function loadFixture(fileName) {
scripts/test-decision-contract.js:206:async function testDecideModelFallbackOrder() {
scripts/test-decision-contract.js:20:function loadJsonFromRepo(...segments) {
scripts/test-decision-contract.js:24:function assertIsoTimestamp(value, label) {
scripts/test-decision-contract.js:260:async function testDecideModelFallbackOnEmptyText() {
scripts/test-decision-contract.js:29:function assertLineage(payload, label) {
scripts/test-decision-contract.js:318:async function testDecideExtendedFallbackOrder() {
scripts/test-decision-contract.js:37:async function testDecideSingleFixture() {
scripts/test-decision-contract.js:380:async function testPolicyV1Fixture() {
scripts/test-decision-contract.js:389:async function testWorkflowFixture() {
scripts/test-decision-contract.js:406:async function testUcpVendorEnumConsistency() {
scripts/test-decision-contract.js:427:async function main() {
scripts/test-decision-contract.js:73:async function testDecideApiKeyFixture() {
scripts/test-helpers/http-harness.js:1:export function createReq({
scripts/test-helpers/http-harness.js:24:export function createRes() {
scripts/test-helpers/http-harness.js:38:export async function invokeJson(handler, reqOptions = {}) {
scripts/test-policy-alerts-api.js:28:async function invoke(query = {}, method = "GET") {
scripts/test-policy-alerts-api.js:42:function assertCommonPayload(result, expectedState, expectedLimit, expectedIncludeZero = true) {
scripts/test-policy-alerts-api.js:54:function assertNoLegacySourceObject(result) {
scripts/test-policy-alerts-api.js:59:function assertAlertShapeIfPresent(result) {
scripts/test-policy-alerts-api.js:70:async function main() {
scripts/test-policy-alerts-api.js:7:function createResponseRecorder() {
scripts/test-policy-feed.js:13:function loadFixture(fileName) {
scripts/test-policy-feed.js:17:function runFixture(fileName) {
scripts/test-policy-feed.js:36:function testIdempotentDuplicateSuppression() {
scripts/test-policy-feed.js:58:function main() {
scripts/verify-policy-alerts-bridge.js:121:async function fetchJson(url) {
scripts/verify-policy-alerts-bridge.js:141:async function main() {
scripts/verify-policy-alerts-bridge.js:16:function sleep(ms) {
scripts/verify-policy-alerts-bridge.js:20:function buildRequestUrl(baseUrl, state, limit) {
scripts/verify-policy-alerts-bridge.js:27:function isLegacyPayload(payload) {
scripts/verify-policy-alerts-bridge.js:32:function extractRunId(runUrl = "") {
scripts/verify-policy-alerts-bridge.js:37:function validatePayload(payload, options) {
scripts/verify-policy-alerts-bridge.js:3:function toInt(value, fallback) {
scripts/verify-policy-alerts-bridge.js:8:function toFlag(value, fallback = false) {
scripts/workflow-zendesk-refund-test.js:26:function createRes() {
scripts/workflow-zendesk-refund-test.js:3:function createReq({
scripts/workflow-zendesk-refund-test.js:40:function parseJson(label, body) {
scripts/workflow-zendesk-refund-test.js:48:function expect(condition, message) {
scripts/workflow-zendesk-refund-test.js:52:async function runCase(label, handler, reqOptions, assertFn) {
scripts/workflow-zendesk-refund-test.js:61:async function main() {
```

### Import/require graph

```text
api/cancel-mcp.js:1:import { compute, getSupportedVendors } from "../lib/cancel-compute.js";
api/cancel-mcp.js:2:import { createMcpHandler } from "../lib/mcp-handler.js";
api/compliance-export.js:1:import { buildComplianceSnapshot, snapshotToCsv } from "../lib/compliance-export.js";
api/decide.js:1:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../lib/rate-limit.js";
api/decide.js:2:import { persistLog } from "../lib/log.js";
api/decide.js:3:import { buildSourceHash, withLineage } from "../lib/lineage.js";
api/decide.js:4:import { timingSafeEqual } from "node:crypto";
api/mcp.js:1:import { compute, getSupportedVendors } from "../lib/refund-compute.js";
api/mcp.js:2:import { createMcpHandler } from "../lib/mcp-handler.js";
api/metrics.js:1:import { getMetricsSnapshot } from "../lib/metrics-store.js";
api/metrics.js:2:import { getAxiomMetricsSnapshot } from "../lib/metrics-axiom.js";
api/metrics.js:3:import { getClientIp } from "../lib/rate-limit.js";
api/policy-alerts.js:1:import { readFileSync, existsSync } from "node:fs";
api/policy-alerts.js:2:import { dirname, join } from "node:path";
api/policy-alerts.js:3:import { fileURLToPath } from "node:url";
api/policy-alerts.js:4:import { getPolicySupabaseConfig, supabaseRestRequest } from "../lib/policy-supabase.js";
api/policy-fetch-hook.js:1:import { timingSafeEqual } from "node:crypto";
api/return-mcp.js:1:import { compute, getSupportedVendors } from "../lib/return-compute.js";
api/return-mcp.js:2:import { createMcpHandler } from "../lib/mcp-handler.js";
api/track.js:1:import { createRateLimiter, getClientIp, addRateLimitHeaders } from "../lib/rate-limit.js";
api/track.js:2:import { persistLog } from "../lib/log.js";
api/track.js:3:import { recordClientEvent, recordVendorRequest } from "../lib/metrics-store.js";
api/trial-mcp.js:1:import { compute, getSupportedVendors } from "../lib/trial-compute.js";
api/trial-mcp.js:2:import { createMcpHandler } from "../lib/mcp-handler.js";
api/v1/[policy]/[action].js:1:import cancelPenaltyHandler from "../../../lib/routes/v1/policies/cancel-penalty.js";
api/v1/[policy]/[action].js:2:import refundEligibilityHandler from "../../../lib/routes/v1/policies/refund-eligibility.js";
api/v1/[policy]/[action].js:3:import returnEligibilityHandler from "../../../lib/routes/v1/policies/return-eligibility.js";
api/v1/[policy]/[action].js:4:import trialTermsHandler from "../../../lib/routes/v1/policies/trial-terms.js";
api/v1/workflows/zendesk/[workflow].js:1:import zendeskCancelWorkflow from "../../../../lib/routes/v1/workflows/zendesk/cancel.js";
api/v1/workflows/zendesk/[workflow].js:2:import zendeskRefundWorkflow from "../../../../lib/routes/v1/workflows/zendesk/refund.js";
api/v1/workflows/zendesk/[workflow].js:3:import zendeskReturnWorkflow from "../../../../lib/routes/v1/workflows/zendesk/return.js";
api/v1/workflows/zendesk/[workflow].js:4:import zendeskTrialWorkflow from "../../../../lib/routes/v1/workflows/zendesk/trial.js";
client/EXAMPLES.md:62:import requests
client/refund-check.py:26:import sys
client/refund-check.py:27:import requests
lib/cancel-compute.js:1:import { readFileSync } from "node:fs";
lib/cancel-compute.js:2:import { fileURLToPath } from "node:url";
lib/cancel-compute.js:3:import { dirname, join } from "node:path";
lib/cancel-compute.js:4:import { buildSourceHash, withLineage } from "./lineage.js";
lib/compliance-export.js:1:import { existsSync, readFileSync } from "node:fs";
lib/compliance-export.js:2:import { dirname, join } from "node:path";
lib/compliance-export.js:3:import { fileURLToPath } from "node:url";
lib/lineage.js:1:import { createHash } from "node:crypto";
lib/mcp-handler.js:1:import { createRateLimiter, getClientIp, addRateLimitHeaders } from "./rate-limit.js";
lib/mcp-handler.js:2:import { persistLog } from "./log.js";
lib/refund-compute.js:1:import { readFileSync } from "node:fs";
lib/refund-compute.js:2:import { fileURLToPath } from "node:url";
lib/refund-compute.js:3:import { dirname, join } from "node:path";
lib/refund-compute.js:4:import { buildSourceHash, withLineage } from "./lineage.js";
lib/return-compute.js:1:import { readFileSync } from "node:fs";
lib/return-compute.js:2:import { fileURLToPath } from "node:url";
lib/return-compute.js:3:import { dirname, join } from "node:path";
lib/return-compute.js:4:import { buildSourceHash, withLineage } from "./lineage.js";
lib/routes/v1/policies/cancel-penalty.js:1:import { compute, getRulesVersion } from "../../../cancel-compute.js";
lib/routes/v1/policies/cancel-penalty.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
lib/routes/v1/policies/cancel-penalty.js:3:import { persistLog } from "../../../log.js";
lib/routes/v1/policies/refund-eligibility.js:1:import { compute, getRulesVersion } from "../../../refund-compute.js";
lib/routes/v1/policies/refund-eligibility.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
lib/routes/v1/policies/refund-eligibility.js:3:import { persistLog } from "../../../log.js";
lib/routes/v1/policies/return-eligibility.js:1:import { compute, getRulesVersion } from "../../../return-compute.js";
lib/routes/v1/policies/return-eligibility.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
lib/routes/v1/policies/return-eligibility.js:3:import { persistLog } from "../../../log.js";
lib/routes/v1/policies/trial-terms.js:1:import { compute, getRulesVersion } from "../../../trial-compute.js";
lib/routes/v1/policies/trial-terms.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
lib/routes/v1/policies/trial-terms.js:3:import { persistLog } from "../../../log.js";
lib/routes/v1/workflows/zendesk/cancel.js:1:import cancelPenaltyHandler from "../../policies/cancel-penalty.js";
lib/routes/v1/workflows/zendesk/cancel.js:2:import { createZendeskWorkflowHandler } from "./workflow-common.js";
lib/routes/v1/workflows/zendesk/refund.js:1:import refundEligibilityHandler from "../../policies/refund-eligibility.js";
lib/routes/v1/workflows/zendesk/refund.js:2:import { createZendeskWorkflowHandler } from "./workflow-common.js";
lib/routes/v1/workflows/zendesk/return.js:1:import returnEligibilityHandler from "../../policies/return-eligibility.js";
lib/routes/v1/workflows/zendesk/return.js:2:import { createZendeskWorkflowHandler } from "./workflow-common.js";
lib/routes/v1/workflows/zendesk/trial.js:1:import trialTermsHandler from "../../policies/trial-terms.js";
lib/routes/v1/workflows/zendesk/trial.js:2:import { createZendeskWorkflowHandler } from "./workflow-common.js";
lib/routes/v1/workflows/zendesk/workflow-common.js:1:import decideHandler from "../../../../../api/decide.js";
lib/routes/v1/workflows/zendesk/workflow-common.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../../rate-limit.js";
lib/routes/v1/workflows/zendesk/workflow-common.js:3:import { persistLog } from "../../../../log.js";
lib/trial-compute.js:1:import { readFileSync } from "node:fs";
lib/trial-compute.js:2:import { fileURLToPath } from "node:url";
lib/trial-compute.js:3:import { dirname, join } from "node:path";
lib/trial-compute.js:4:import { buildSourceHash, withLineage } from "./lineage.js";
scripts/check-policies.js:13:import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
scripts/check-policies.js:14:import { createHash } from "node:crypto";
scripts/check-policies.js:15:import { fileURLToPath, pathToFileURL } from "node:url";
scripts/check-policies.js:16:import { dirname, join } from "node:path";
scripts/check-policies.js:17:import { buildAlertSignature } from "./lib/policy-feed-reliability.js";
scripts/check-policies.js:18:import { getPolicySupabaseConfig, supabaseRestRequest, supabaseUpsertRows } from "../lib/policy-supabase.js";
scripts/generate-outbound-domain-inventory.mjs:3:import fs from 'node:fs';
scripts/generate-outbound-domain-inventory.mjs:4:import path from 'node:path';
scripts/lib/policy-feed-reliability.js:1:import { createHash } from "node:crypto";
scripts/site-bridge-regression.js:3:import fs from "node:fs";
scripts/site-bridge-regression.js:4:import path from "node:path";
scripts/site-bridge-regression.js:5:import { fileURLToPath } from "node:url";
scripts/smoke-test.js:10:import zendeskWorkflowRoute from "../api/v1/workflows/zendesk/[workflow].js";
scripts/smoke-test.js:1:import health from "../api/health.js";
scripts/smoke-test.js:2:import v1PolicyRoute from "../api/v1/[policy]/[action].js";
scripts/smoke-test.js:3:import refundMcp from "../api/mcp.js";
scripts/smoke-test.js:4:import cancelMcp from "../api/cancel-mcp.js";
scripts/smoke-test.js:5:import returnMcp from "../api/return-mcp.js";
scripts/smoke-test.js:6:import trialMcp from "../api/trial-mcp.js";
scripts/smoke-test.js:7:import track from "../api/track.js";
scripts/smoke-test.js:8:import metrics from "../api/metrics.js";
scripts/smoke-test.js:9:import complianceExport from "../api/compliance-export.js";
scripts/test-check-policies.js:3:import assert from "node:assert/strict";
scripts/test-check-policies.js:5:import {
scripts/test-decision-contract.js:10:import zendeskWorkflowDispatcher from "../api/v1/workflows/zendesk/[workflow].js";
scripts/test-decision-contract.js:11:import { invokeJson } from "./test-helpers/http-harness.js";
scripts/test-decision-contract.js:3:import assert from "node:assert/strict";
scripts/test-decision-contract.js:4:import { readFileSync } from "node:fs";
scripts/test-decision-contract.js:5:import { dirname, join } from "node:path";
scripts/test-decision-contract.js:6:import { fileURLToPath } from "node:url";
scripts/test-decision-contract.js:8:import decideHandler from "../api/decide.js";
scripts/test-decision-contract.js:9:import v1PolicyDispatcher from "../api/v1/[policy]/[action].js";
scripts/test-policy-alerts-api.js:3:import assert from "node:assert/strict";
scripts/test-policy-alerts-api.js:5:import handler from "../api/policy-alerts.js";
scripts/test-policy-feed.js:3:import assert from "node:assert/strict";
scripts/test-policy-feed.js:4:import { readFileSync } from "node:fs";
scripts/test-policy-feed.js:5:import { dirname, join } from "node:path";
scripts/test-policy-feed.js:6:import { fileURLToPath } from "node:url";
scripts/test-policy-feed.js:8:import { mergePolicyAlertFeed } from "./lib/policy-feed-reliability.js";
scripts/workflow-zendesk-refund-test.js:1:import zendeskWorkflowRoute from "../api/v1/workflows/zendesk/[workflow].js";
```

### Frontend script load graph (`public/index.html`)

```text
```

## Regeneration Commands

```bash
./scripts/generate-project-inventory.sh
./scripts/check-project-inventory.sh
```
