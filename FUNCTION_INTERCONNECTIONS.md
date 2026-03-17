# Function Inventory + Interconnection Map

Generated: 2026-03-06 17:56:38 CET

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
api/decide.js:101:function readApiToken(req) {
api/decide.js:10:function rid() {
api/decide.js:113:function safeEqualToken(left, right) {
api/decide.js:123:function parseFlag(value) {
api/decide.js:128:function readTrustedProxyContext(req) {
api/decide.js:14:function normalize(s = "") {
api/decide.js:154:function sendDecisionJson(res, statusCode, payload, lineageInput = {}) {
api/decide.js:170:export default async function handler(req, res) {
api/decide.js:18:function wantsAdvice(q) {
api/decide.js:22:function isFinanceAdvice(q) {
api/decide.js:28:function isMedicalAdvice(q) {
api/decide.js:34:function isLegalAdvice(q) {
api/decide.js:40:function parseMultiQuestion(raw = "") {
api/decide.js:59:function extractJson(text = "") {
api/decide.js:78:function sanitizeScore(n) {
api/decide.js:85:function normalizeHeaderValue(value) {
api/decide.js:90:function readHeader(req, name = "") {
api/health.js:12:function inferServiceFromHost(host) {
api/health.js:3:function normalizeHost(req) {
api/health.js:51:export default function handler(req, res) {
api/mcp.js:39:function formatTextMessage(payload) {
api/mcp.js:43:export default createMcpHandler({
api/metrics.js:11:export default async function handler(req, res) {
api/metrics.js:5:function send(res, status, payload) {
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
scripts/check-policies.js:1023:function buildSemanticProfile(text, policyType, metadata = {}) {
scripts/check-policies.js:1042:function normalizeSemanticProfile(input, metadata = {}) {
scripts/check-policies.js:1065:function diffSemanticProfiles(previousProfile, nextProfile) {
scripts/check-policies.js:1089:function formatSemanticDiffSummary(semanticDiff) {
scripts/check-policies.js:1099:function buildSemanticDiffSignature(semanticDiff) {
scripts/check-policies.js:1106:function getActualConfirmRuns() {
scripts/check-policies.js:1111:function getActualConfirmRunsForVendor(vendorConfig, vendor) {
scripts/check-policies.js:1128:function getActualMinGapMs() {
scripts/check-policies.js:1134:function getActualMinGapHours() {
scripts/check-policies.js:1139:function getCandidateTtlDays() {
scripts/check-policies.js:1144:function getPendingDetailLimit() {
scripts/check-policies.js:1149:function getSameRunRecheckPasses() {
scripts/check-policies.js:1154:function getSameRunRecheckDelayMs() {
scripts/check-policies.js:1159:function getSameRunRecheckBatchSize(defaultSize = 3) {
scripts/check-policies.js:1164:function getSameRunMajorityMinVotes() {
scripts/check-policies.js:1169:function getCrossRunWindowSize() {
scripts/check-policies.js:1174:function getCrossRunWindowRequired() {
scripts/check-policies.js:1182:function getStalePendingDays() {
scripts/check-policies.js:1187:function getVolatileFlipThreshold() {
scripts/check-policies.js:1192:function getEscalationPendingDays() {
scripts/check-policies.js:1197:function getEscalationFlipThreshold() {
scripts/check-policies.js:1202:function getFetchFailureQuarantineStreak() {
scripts/check-policies.js:1207:function getEscalationFlipThresholdForVendor(policyName, vendor) {
scripts/check-policies.js:1226:function getNoConfirmEscalationDays() {
scripts/check-policies.js:1231:function getMaterialCooldownDays() {
scripts/check-policies.js:1236:function getMaterialOscillationWindowDays() {
scripts/check-policies.js:1241:function getCandidatePendingSinceUtc(candidate) {
scripts/check-policies.js:1252:function getCandidateAgeDays(candidate, nowMs = Date.now()) {
scripts/check-policies.js:1260:function toMsOrNaN(isoValue) {
scripts/check-policies.js:1265:function appendSignalWindow(coverageEntry, signal) {
scripts/check-policies.js:1278:function evaluateSignalWindow(signalWindow) {
scripts/check-policies.js:1308:function getRunMajorityDecision(observations) {
scripts/check-policies.js:1345:function sortedLimitedVendors(vendors, limit = getPendingDetailLimit()) {
scripts/check-policies.js:1350:function isStaleCandidate(candidate, nowMs = Date.now()) {
scripts/check-policies.js:1363:async function fetchText(url, attempts = 3) {
scripts/check-policies.js:1402:async function fetchBrowserHookText({ url, vendor, policyType }, attempts = 1) {
scripts/check-policies.js:1485:function toJinaMirrorUrl(url) {
scripts/check-policies.js:1494:function toZendeskArticleApiUrl(url) {
scripts/check-policies.js:1508:async function fetchZendeskArticleJson(apiUrl, attempts = 2) {
scripts/check-policies.js:1563:function buildCandidateUrls(vendorConfig) {
scripts/check-policies.js:1581:async function attemptFetchLane({ lane, candidateUrl, context }) {
scripts/check-policies.js:1657:async function fetchWithFallback(vendorConfig, context = {}) {
scripts/check-policies.js:1700:async function checkPolicySet({ name, sourcesPath, hashesPath, candidatesPath, coveragePath, semanticPath, rulesFile }) {
scripts/check-policies.js:1803:  const ensureCoverageEntry = (vendor) => {
scripts/check-policies.js:1810:  const markSuccessfulFetch = (vendor, whenUtc, fetchLane = "") => {
scripts/check-policies.js:1818:  const markConfirmedChange = (vendor, whenUtc) => {
scripts/check-policies.js:1823:  const registerConfirmedChange = ({ vendor, sourceUrl, confirmedHash, confirmedProfile, confirmedAtUtc }) => {
scripts/check-policies.js:206:function hash(text) {
scripts/check-policies.js:210:function readJson(filePath, fallback = {}) {
scripts/check-policies.js:219:function sleep(ms) {
scripts/check-policies.js:223:function jitter(ms) {
scripts/check-policies.js:229:function normalizeFetchLane(value) {
scripts/check-policies.js:233:function normalizeFetchLaneList(values) {
scripts/check-policies.js:246:function parseFetchLaneCsv(value) {
scripts/check-policies.js:250:function getDefaultFetchLanes() {
scripts/check-policies.js:259:function getVendorFetchLanes(vendorConfig) {
scripts/check-policies.js:2633:async function main() {
scripts/check-policies.js:265:function normalizeTier1VendorList(value) {
scripts/check-policies.js:278:function loadTier1VendorsConfig() {
scripts/check-policies.js:2865:  const toPolicyCountString = (items) => Object.entries(summarizePolicyCounts(items))
scripts/check-policies.js:288:function getTier1TargetForPolicy(policyType, availableVendors, tier1Config) {
scripts/check-policies.js:298:function utcIsoTimestamp(date = new Date()) {
scripts/check-policies.js:302:function summarizePolicyCounts(changedItems) {
scripts/check-policies.js:311:function toPolicyCountObject(changedItems) {
scripts/check-policies.js:321:function getPolicyAlertFeedMaxEntries() {
scripts/check-policies.js:327:function getPolicyAlertLowSignalThreshold() {
scripts/check-policies.js:332:function getPolicyAlertLowSignalLookback() {
scripts/check-policies.js:337:function getPolicyAlertIncludeZeroChange() {
scripts/check-policies.js:342:function buildRunUrl() {
scripts/check-policies.js:349:function updatePolicyAlertFeed(entry) {
scripts/check-policies.js:383:function readNdjson(filePath) {
scripts/check-policies.js:403:function buildPolicyEventId(item) {
scripts/check-policies.js:411:function appendPolicyEventLog(changedItems, generatedAtUtc = utcIsoTimestamp()) {
scripts/check-policies.js:477:function updateJsonStringField(filePath, fieldName, nextValue) {
scripts/check-policies.js:492:function detectFetchInterstitial(text) {
scripts/check-policies.js:512:function normalizeFetchFailureReasonToken(errorMessage) {
scripts/check-policies.js:521:function parseFetchFailureSegments(failureReason) {
scripts/check-policies.js:541:function isImmediateFetchBlockErrorMessage(errorMessage) {
scripts/check-policies.js:548:function isAuxiliaryFetchFailureSegment(segment) {
scripts/check-policies.js:555:export function classifyFetchFailureBlock(failureReason) {
scripts/check-policies.js:589:export function getCandidatePendingModelId(candidate) {
scripts/check-policies.js:597:export function isLegacyPendingCandidate(candidate) {
scripts/check-policies.js:601:function getPendingModelFirstObservedUtc(candidate, fallback = "") {
scripts/check-policies.js:608:function markCandidatePendingModel(candidate, firstObservedUtc) {
scripts/check-policies.js:616:function decodeHtmlEntities(input) {
scripts/check-policies.js:628:function escapeRegexLiteral(value) {
scripts/check-policies.js:632:function getPolicyKeywordRegex(policyType) {
scripts/check-policies.js:644:function getPolicyKeywords(policyType) {
scripts/check-policies.js:651:function getVendorKeywordRegex(vendorKey) {
scripts/check-policies.js:662:function extractVendorStableText(lines, vendorKey) {
scripts/check-policies.js:682:function extractPolicyFocusedText(lines, policyType) {
scripts/check-policies.js:705:function normalizeFetchedText(rawText, policyType = "default", vendorKey = "") {
scripts/check-policies.js:743:function getFetchQualityMinChars() {
scripts/check-policies.js:748:function getFetchQualityMinLines() {
scripts/check-policies.js:753:function getFetchQualityMinPolicyHits() {
scripts/check-policies.js:758:function countPolicyKeywordHits(text, policyType) {
scripts/check-policies.js:771:function assessFetchQuality({ rawText, normalizedText, policyType }) {
scripts/check-policies.js:806:function normalizePageMetadata(input = {}) {
scripts/check-policies.js:826:function toIsoDateOnly(value) {
scripts/check-policies.js:834:function buildPageMetadataSignature(input) {
scripts/check-policies.js:855:function extractMetadataText(rawText) {
scripts/check-policies.js:867:function extractDateLabelFromText(text, labelPattern) {
scripts/check-policies.js:875:function extractTitleFromText(rawText) {
scripts/check-policies.js:891:function extractPageMetadata({ rawText, sourceMetadata } = {}) {
scripts/check-policies.js:916:function normalizeSemanticTokens(tokens) {
scripts/check-policies.js:924:function semanticTokenSignature(profile) {
scripts/check-policies.js:929:function extractDurationTokens(text, anchors = [], tokenPrefix = "window_days") {
scripts/check-policies.js:957:function extractSemanticTokens(text, policyType = "default") {
scripts/check-policies.js:962:  const addIfMatch = (token, regex) => {
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
scripts/smoke-test.js:12:function createReq({
scripts/smoke-test.js:35:function createRes() {
scripts/smoke-test.js:49:function parseJson(label, body) {
scripts/smoke-test.js:57:async function runCase(label, handler, reqOptions, assertFn) {
scripts/smoke-test.js:66:function expect(condition, message) {
scripts/smoke-test.js:72:async function main() {
scripts/test-check-policies.js:13:function testImmediateBlockOnCloudflareAnd403() {
scripts/test-check-policies.js:26:function testImmediateBlockAllowsZendesk404AsAuxiliary() {
scripts/test-check-policies.js:39:function testTransientFailureDoesNotImmediateBlock() {
scripts/test-check-policies.js:51:function testPlain403StillImmediateBlocks() {
scripts/test-check-policies.js:58:function testLegacyPendingModelDefaults() {
scripts/test-check-policies.js:67:function testCurrentPendingModelStaysActive() {
scripts/test-check-policies.js:77:function main() {
scripts/test-decision-contract.js:117:async function testPolicyV1Fixture() {
scripts/test-decision-contract.js:126:async function testWorkflowFixture() {
scripts/test-decision-contract.js:143:async function testUcpVendorEnumConsistency() {
scripts/test-decision-contract.js:164:async function main() {
scripts/test-decision-contract.js:16:function loadFixture(fileName) {
scripts/test-decision-contract.js:20:function loadJsonFromRepo(...segments) {
scripts/test-decision-contract.js:24:function assertIsoTimestamp(value, label) {
scripts/test-decision-contract.js:29:function assertLineage(payload, label) {
scripts/test-decision-contract.js:37:async function testDecideSingleFixture() {
scripts/test-decision-contract.js:73:async function testDecideApiKeyFixture() {
scripts/test-helpers/http-harness.js:1:export function createReq({
scripts/test-helpers/http-harness.js:24:export function createRes() {
scripts/test-helpers/http-harness.js:38:export async function invokeJson(handler, reqOptions = {}) {
scripts/test-policy-feed.js:13:function loadFixture(fileName) {
scripts/test-policy-feed.js:17:function runFixture(fileName) {
scripts/test-policy-feed.js:36:function testIdempotentDuplicateSuppression() {
scripts/test-policy-feed.js:58:function main() {
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
scripts/check-policies.js:13:import { readFileSync, writeFileSync, existsSync } from "node:fs";
scripts/check-policies.js:14:import { createHash } from "node:crypto";
scripts/check-policies.js:15:import { fileURLToPath, pathToFileURL } from "node:url";
scripts/check-policies.js:16:import { dirname, join } from "node:path";
scripts/check-policies.js:17:import { mergePolicyAlertFeed } from "./lib/policy-feed-reliability.js";
scripts/generate-outbound-domain-inventory.mjs:3:import fs from 'node:fs';
scripts/generate-outbound-domain-inventory.mjs:4:import path from 'node:path';
scripts/lib/policy-feed-reliability.js:1:import { createHash } from "node:crypto";
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
