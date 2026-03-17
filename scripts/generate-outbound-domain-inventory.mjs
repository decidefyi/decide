#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { input: '', output: '', issues: '', repo: '' };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') {
      args.input = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (token === '--output') {
      args.output = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (token === '--issues') {
      args.issues = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (token === '--repo') {
      args.repo = argv[i + 1] || '';
      i += 1;
      continue;
    }
  }

  if (!args.input || !args.output || !args.issues) {
    throw new Error('Usage: node scripts/generate-outbound-domain-inventory.mjs --input <path> --output <path> --issues <path> [--repo <name>]');
  }

  return args;
}

const CRITICAL_TAGS = new Set([
  'vercel',
  'github',
  'stripe',
  'resend',
  'uptimerobot',
  'browserless',
  'jina_mirror',
  'gemini',
  'clerk',
  'supabase',
  'axiom',
  'calendly',
  'cloudflare',
]);

function firstPartySuffixes(repo) {
  const name = String(repo || '').toLowerCase();
  if (name.startsWith('decide') || name.startsWith('decidesite')) return ['decide.fyi'];
  if (name.startsWith('krafthaus')) return ['krafthaus.app'];
  if (name.startsWith('signal')) return ['signalnio.com'];
  return [];
}

function cleanUrl(rawUrl) {
  let value = String(rawUrl || '').trim();
  while (value.length && /[),.;'"\]>]$/.test(value)) {
    value = value.slice(0, -1);
  }
  return value;
}

function splitCombinedUrls(rawUrl) {
  return String(rawUrl || '')
    .split(/,(?=https?:\/\/)/g)
    .map((part) => cleanUrl(part))
    .filter(Boolean);
}

function normalizeHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  if (/[,\s]/.test(host)) return '';
  if (!/^[*a-z0-9][*a-z0-9.-]*$/.test(host)) return '';
  if (!/[a-z0-9]/.test(host.replace(/\*/g, ''))) return '';
  return host;
}

function inferContexts(filePath) {
  const p = String(filePath || '');
  const contexts = new Set();

  if (/\/api\//.test(p) || /\/lib\//.test(p)) contexts.add('runtime_code');
  if (/\/public\//.test(p) || /\/app\//.test(p) || /\/components\//.test(p) || /index\.html$/i.test(p)) contexts.add('frontend');
  if (/\/scripts\//.test(p)) contexts.add('scripts');
  if (/\/docs\//.test(p) || /\.md$/i.test(p) || /\.txt$/i.test(p)) contexts.add('docs_content');
  if (/vercel\.json$/i.test(p) || /\.env/i.test(p) || /package\.json$/i.test(p) || /\.json$/i.test(p)) contexts.add('config_or_data');
  if (/\/rules\//.test(p) || /vendors\.json$/i.test(p)) contexts.add('data_source');

  if (!contexts.size) contexts.add('other');
  return Array.from(contexts).sort();
}

function inferTags(host, ownSuffixes) {
  const h = String(host || '').toLowerCase();
  const tags = new Set();

  if (h.endsWith('vercel.app') || h === '*.vercel.app') tags.add('vercel');
  if (h === 'github.com' || h === 'api.github.com' || h === 'raw.githubusercontent.com') tags.add('github');
  if (h.endsWith('stripe.com')) tags.add('stripe');
  if (h === 'api.resend.com') tags.add('resend');
  if (h === 'api.uptimerobot.com') tags.add('uptimerobot');
  if (h.includes('browserless.io')) tags.add('browserless');
  if (h === 'r.jina.ai') tags.add('jina_mirror');
  if (h === 'generativelanguage.googleapis.com') tags.add('gemini');
  if (
    h.endsWith('clerk.com') ||
    h.endsWith('clerk.dev') ||
    h === 'api.clerk.com' ||
    h.endsWith('clerk.decide.fyi') ||
    h.endsWith('accounts.decide.fyi') ||
    h === '*.clerk.com' ||
    h === '*.clerk.dev'
  ) {
    tags.add('clerk');
  }
  if (h.endsWith('supabase.co')) tags.add('supabase');
  if (h === 'api.axiom.co') tags.add('axiom');
  if (h.endsWith('calendly.com')) tags.add('calendly');
  if (h.endsWith('cloudflare.com')) tags.add('cloudflare');
  if (h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com') tags.add('google_fonts');

  if (ownSuffixes.some((suffix) => h === suffix || h.endsWith(`.${suffix}`) || h === `*.${suffix}`)) {
    tags.add('first_party');
  } else {
    tags.add('third_party');
  }

  return Array.from(tags).sort();
}

function riskTier(tags, contexts) {
  const tagSet = new Set(tags);
  const contextSet = new Set(contexts);

  if (tagSet.has('gemini') || tagSet.has('browserless') || tagSet.has('jina_mirror') || tagSet.has('supabase')) {
    return { tier: 'T0-critical-runtime', reason: 'Direct runtime dependency for decisioning/fetch/storage.' };
  }

  if (tagSet.has('stripe') || tagSet.has('resend') || tagSet.has('clerk') || tagSet.has('calendly')) {
    return { tier: 'T1-auth-billing', reason: 'Auth, payment, or customer-contact dependency.' };
  }

  if (tagSet.has('vercel') || tagSet.has('github') || tagSet.has('cloudflare')) {
    return { tier: 'T1-platform-control', reason: 'Platform/control-plane dependency.' };
  }

  if (tagSet.has('uptimerobot') || tagSet.has('axiom')) {
    return { tier: 'T1-observability', reason: 'Monitoring/logging dependency.' };
  }

  if (tagSet.has('first_party')) {
    return { tier: 'T2-first-party-surface', reason: 'Internal domain surface (non-critical tag).' };
  }

  if (contextSet.has('runtime_code')) {
    return { tier: 'T2-runtime-third-party', reason: 'Referenced by runtime code path.' };
  }

  return { tier: 'T3-content-static', reason: 'Docs/content/static linkage only.' };
}

function isCriticalDomain(tags) {
  return tags.some((tag) => CRITICAL_TAGS.has(tag));
}

function asSorted(setLike) {
  return Array.from(setLike).sort();
}

function sampleRefs(entry, maxItems = 3) {
  const sorted = entry.examples
    .slice()
    .sort((a, b) => compareAscii(a.path, b.path) || a.lineNo - b.lineNo || compareAscii(a.url, b.url));
  return sorted.slice(0, maxItems).map((item) => `${item.path}:${item.lineNo}`).join(', ');
}

function trimCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderTableRow(cells) {
  return `| ${cells.map((cell) => trimCell(cell)).join(' | ')} |`;
}

function compareAscii(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function buildIssuesMarkdown({ timestamp, issues, rawLineCount }) {
  const reasonCounts = new Map();
  for (const item of issues) {
    reasonCounts.set(item.reason, (reasonCounts.get(item.reason) || 0) + 1);
  }

  let out = '';
  out += '# Outbound URL Parse Issues\n\n';
  out += `Generated: ${timestamp}\n\n`;
  out += `- Raw URL-matched lines scanned: **${rawLineCount}**\n`;
  out += `- Parse/normalization issues: **${issues.length}**\n\n`;

  out += '## Reason Summary\n\n';
  for (const [reason, count] of Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1] || compareAscii(a[0], b[0]))) {
    out += `- ${reason}: ${count}\n`;
  }
  out += '\n';

  out += '## Issue List\n\n';
  out += '| File | Line | Reason | URL fragment |\n';
  out += '| --- | ---: | --- | --- |\n';
  for (const item of issues) {
    out += `${renderTableRow([item.path, item.lineNo, item.reason, item.url])}\n`;
  }
  out += '\n';

  return out;
}

function buildInventoryMarkdown({ timestamp, summary, topByOccurrences, criticalHosts, hosts, repo }) {
  const tierCounts = new Map();
  for (const host of hosts) {
    tierCounts.set(host.risk.tier, (tierCounts.get(host.risk.tier) || 0) + 1);
  }

  let out = '';
  out += '# Outbound Domain Inventory (Exhaustive)\n\n';
  out += `Generated: ${timestamp}\n\n`;
  out += `Repository: \`${repo || 'unknown'}\`\n\n`;
  out += 'This inventory includes all detected `http/https` outbound URLs across runtime code, frontend content, docs, and scripts in this repository.\n\n';
  out += 'Lockfiles and binary image assets are excluded to reduce noise.\n\n';

  out += '## 1) Snapshot\n\n';
  out += `- Total URL occurrences scanned: **${summary.totalUrlOccurrences}**\n`;
  out += `- Valid URL occurrences parsed: **${summary.validUrlOccurrences}**\n`;
  out += `- Invalid/truncated URL occurrences: **${summary.invalidUrlOccurrences}**\n`;
  out += `- Unique hosts: **${summary.uniqueHosts}**\n`;
  out += `- Critical integration hosts: **${summary.criticalHosts}**\n`;
  out += `- First-party hosts: **${summary.firstPartyHosts}**\n`;
  out += `- Third-party hosts: **${summary.thirdPartyHosts}**\n\n`;

  out += '### Risk-tier distribution\n\n';
  for (const [tier, count] of Array.from(tierCounts.entries()).sort((a, b) => compareAscii(a[0], b[0]))) {
    out += `- ${tier}: ${count}\n`;
  }
  out += '\n';

  out += '### Top hosts by URL occurrences\n\n';
  out += '| Host | URL occurrences | Files | Risk tier | Tag(s) |\n';
  out += '| --- | ---: | ---: | --- | --- |\n';
  for (const h of topByOccurrences) {
    out += `${renderTableRow([h.host, String(h.urlCount), String(h.files.size), h.risk.tier, asSorted(h.tags).join(', ')])}\n`;
  }
  out += '\n';

  out += '## 2) Critical Integration Domains\n\n';
  out += 'These are domains tagged as runtime/ops critical (`vercel`, `github`, `stripe`, `resend`, `uptimerobot`, `browserless`, `jina_mirror`, `gemini`, `clerk`, `supabase`, `axiom`, `calendly`, `cloudflare`).\n\n';
  out += '| Host | URL occurrences | Files | Context(s) | Risk tier | Tag(s) | Example references |\n';
  out += '| --- | ---: | ---: | --- | --- | --- | --- |\n';
  for (const h of criticalHosts) {
    out += `${renderTableRow([
      h.host,
      String(h.urlCount),
      String(h.files.size),
      asSorted(h.contexts).join(', '),
      `${h.risk.tier} (${h.risk.reason})`,
      asSorted(h.tags).join(', '),
      sampleRefs(h),
    ])}\n`;
  }
  out += '\n';

  out += '## 3) Full Host Inventory (Alphabetical, Exhaustive)\n\n';
  out += '| Host | URL occurrences | Files | Context(s) | Risk tier | Tag(s) | Example references |\n';
  out += '| --- | ---: | ---: | --- | --- | --- | --- |\n';
  for (const h of hosts) {
    out += `${renderTableRow([
      h.host,
      String(h.urlCount),
      String(h.files.size),
      asSorted(h.contexts).join(', '),
      h.risk.tier,
      asSorted(h.tags).join(', '),
      sampleRefs(h),
    ])}\n`;
  }
  out += '\n';

  out += '## 4) Generation Method\n\n';
  out += '```bash\n';
  out += "./scripts/generate-project-inventory.sh\n";
  out += '```\n\n';
  out += '- URLs are host-normalized (`URL.hostname`) with cleanup for comma-separated URL strings.\n';
  out += '- Risk tiers are rule-based and prioritized from runtime-critical to content/static.\n';
  out += '- Parse failures are listed in `OUTBOUND_URL_PARSE_ISSUES.md`.\n';

  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const ownSuffixes = firstPartySuffixes(args.repo);
  const rawText = fs.readFileSync(args.input, 'utf8');
  const rawLines = rawText.split(/\r?\n/).filter(Boolean).sort(compareAscii);

  const byHost = new Map();
  const issues = [];
  const seenIssues = new Set();
  let validUrlCount = 0;

  for (const line of rawLines) {
    const match = line.match(/^([^:]+):(\d+):(https?:\/\/.*)$/);
    if (!match) continue;

    const filePath = match[1].replace(/^\.\//, '');
    const lineNo = Number(match[2]);
    const rawMatch = match[3];
    const candidates = splitCombinedUrls(rawMatch);

    for (const urlRaw of candidates) {
      let parsed;
      try {
        parsed = new URL(urlRaw);
      } catch {
        const key = `${filePath}:${lineNo}:${urlRaw}:url_parse_error`;
        if (!seenIssues.has(key)) {
          seenIssues.add(key);
          issues.push({ path: filePath, lineNo, url: urlRaw, reason: 'url_parse_error' });
        }
        continue;
      }

      const host = normalizeHost(parsed.hostname);
      if (!host) {
        const key = `${filePath}:${lineNo}:${urlRaw}:invalid_host`;
        if (!seenIssues.has(key)) {
          seenIssues.add(key);
          issues.push({ path: filePath, lineNo, url: urlRaw, reason: 'invalid_host' });
        }
        continue;
      }

      validUrlCount += 1;
      const contexts = inferContexts(filePath);
      const tags = inferTags(host, ownSuffixes);

      if (!byHost.has(host)) {
        byHost.set(host, {
          host,
          urlCount: 0,
          contexts: new Set(),
          tags: new Set(),
          files: new Map(),
          examples: [],
          risk: { tier: '', reason: '' },
        });
      }

      const entry = byHost.get(host);
      entry.urlCount += 1;
      contexts.forEach((c) => entry.contexts.add(c));
      tags.forEach((t) => entry.tags.add(t));

      if (!entry.files.has(filePath)) entry.files.set(filePath, new Set());
      entry.files.get(filePath).add(lineNo);

      if (entry.examples.length < 6) {
        entry.examples.push({ path: filePath, lineNo, url: urlRaw });
      }
    }
  }

  const hosts = Array.from(byHost.values()).sort((a, b) => compareAscii(a.host, b.host));
  for (const host of hosts) {
    host.risk = riskTier(asSorted(host.tags), asSorted(host.contexts));
  }

  const criticalHosts = hosts
    .filter((h) => isCriticalDomain(asSorted(h.tags)))
    .sort((a, b) => b.urlCount - a.urlCount || compareAscii(a.host, b.host));

  const summary = {
    totalUrlOccurrences: rawLines.length,
    validUrlOccurrences: validUrlCount,
    invalidUrlOccurrences: issues.length,
    uniqueHosts: hosts.length,
    criticalHosts: criticalHosts.length,
    firstPartyHosts: hosts.filter((h) => h.tags.has('first_party')).length,
    thirdPartyHosts: hosts.filter((h) => h.tags.has('third_party')).length,
  };

  const topByOccurrences = [...hosts]
    .sort((a, b) => b.urlCount - a.urlCount || compareAscii(a.host, b.host))
    .slice(0, 20);

  const timestamp = new Date().toISOString();

  const inventoryMarkdown = buildInventoryMarkdown({
    timestamp,
    summary,
    topByOccurrences,
    criticalHosts,
    hosts,
    repo: args.repo,
  });

  const issuesMarkdown = buildIssuesMarkdown({
    timestamp,
    issues: issues.sort((a, b) => compareAscii(a.path, b.path) || a.lineNo - b.lineNo || compareAscii(a.reason, b.reason) || compareAscii(a.url, b.url)),
    rawLineCount: rawLines.length,
  });

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.mkdirSync(path.dirname(args.issues), { recursive: true });
  fs.writeFileSync(args.output, inventoryMarkdown, 'utf8');
  fs.writeFileSync(args.issues, issuesMarkdown, 'utf8');

  console.log(`Wrote ${args.output}`);
  console.log(`Wrote ${args.issues}`);
  console.log(`Unique hosts: ${summary.uniqueHosts}`);
  console.log(`Critical hosts: ${summary.criticalHosts}`);
  console.log(`Parse issues: ${summary.invalidUrlOccurrences}`);
}

main();
