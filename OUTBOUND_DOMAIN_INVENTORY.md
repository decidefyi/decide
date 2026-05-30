# Outbound Domain Inventory (Exhaustive)

Generated: 2026-05-30T11:39:30.001Z

Repository: `decide`

This inventory includes all detected `http/https` outbound URLs across runtime code, frontend content, docs, and scripts in this repository.

Lockfiles and binary image assets are excluded to reduce noise.

## 1) Snapshot

- Total URL occurrences scanned: **2258**
- Valid URL occurrences parsed: **2252**
- Invalid/truncated URL occurrences: **6**
- Unique hosts: **201**
- Critical integration hosts: **13**
- First-party hosts: **8**
- Third-party hosts: **193**

### Risk-tier distribution

- T0-critical-runtime: 3
- T1-auth-billing: 4
- T1-observability: 1
- T1-platform-control: 5
- T2-first-party-surface: 6
- T3-content-static: 182

### Top hosts by URL occurrences

| Host | URL occurrences | Files | Risk tier | Tag(s) |
| --- | ---: | ---: | --- | --- |
| github.com | 80 | 10 | T1-platform-control | github, third_party |
| www.amazon.com | 79 | 21 | T3-content-static | third_party |
| support.apple.com | 60 | 16 | T3-content-static | third_party |
| support.google.com | 41 | 17 | T3-content-static | third_party |
| help.crunchyroll.com | 30 | 15 | T3-content-static | third_party |
| www.masterclass.com | 28 | 20 | T3-content-static | third_party |
| www.apple.com | 27 | 15 | T3-content-static | third_party |
| www.canva.com | 27 | 17 | T3-content-static | third_party |
| www.peacocktv.com | 26 | 18 | T3-content-static | third_party |
| www.shutterstock.com | 26 | 18 | T3-content-static | third_party |
| discord.com | 25 | 14 | T3-content-static | third_party |
| www.expressvpn.com | 25 | 17 | T3-content-static | third_party |
| www.help.tinder.com | 25 | 16 | T3-content-static | third_party |
| proton.me | 24 | 16 | T3-content-static | third_party |
| ring.com | 24 | 16 | T3-content-static | third_party |
| www.instacart.com | 24 | 16 | T3-content-static | third_party |
| www.mlb.com | 22 | 15 | T3-content-static | third_party |
| www.dropbox.com | 21 | 14 | T3-content-static | third_party |
| www.siriusxm.com | 21 | 15 | T3-content-static | third_party |
| bitwarden.com | 20 | 20 | T3-content-static | third_party |

## 2) Critical Integration Domains

These are domains tagged as runtime/ops critical (`vercel`, `github`, `stripe`, `resend`, `uptimerobot`, `browserless`, `jina_mirror`, `gemini`, `clerk`, `supabase`, `axiom`, `calendly`, `cloudflare`).

| Host | URL occurrences | Files | Context(s) | Risk tier | Tag(s) | Example references |
| --- | ---: | ---: | --- | --- | --- | --- |
| github.com | 80 | 10 | config_or_data, data_source, frontend, other | T1-platform-control (Platform/control-plane dependency.) | github, third_party | public/index.html:344, public/rules/trial-policy-sources.json:29, rules/policy-alert-feed.json:117 |
| *.clerk.com | 3 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, third_party | vercel.json:28, vercel.json:28, vercel.json:28 |
| *.clerk.dev | 3 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, third_party | vercel.json:28, vercel.json:28, vercel.json:28 |
| api.axiom.co | 3 | 2 | other | T1-observability (Monitoring/logging dependency.) | axiom, third_party | lib/log.js:9, lib/metrics-axiom.js:65, lib/metrics-axiom.js:70 |
| challenges.cloudflare.com | 2 | 1 | config_or_data | T1-platform-control (Platform/control-plane dependency.) | cloudflare, third_party | vercel.json:28, vercel.json:28 |
| chrome.browserless.io | 2 | 2 | docs_content, other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | browserless, third_party | README.md:396, api/policy-fetch-hook.js:168 |
| generativelanguage.googleapis.com | 2 | 2 | config_or_data, other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | gemini, third_party | api/decide.js:300, vercel.json:28 |
| r.jina.ai | 2 | 2 | other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | jina_mirror, third_party | api/policy-fetch-hook.js:95, scripts/check-policies.js:3082 |
| raw.githubusercontent.com | 2 | 1 | docs_content | T1-platform-control (Platform/control-plane dependency.) | github, third_party | client/EXAMPLES.md:84, client/EXAMPLES.md:102 |
| *.vercel.app | 1 | 1 | config_or_data | T1-platform-control (Platform/control-plane dependency.) | third_party, vercel | vercel.json:28 |
| accounts.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, first_party | vercel.json:28 |
| clerk.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, first_party | vercel.json:28 |
| decide-1.vercel.app | 1 | 1 | docs_content | T1-platform-control (Platform/control-plane dependency.) | third_party, vercel | README.md:400 |

## 3) Full Host Inventory (Alphabetical, Exhaustive)

| Host | URL occurrences | Files | Context(s) | Risk tier | Tag(s) | Example references |
| --- | ---: | ---: | --- | --- | --- | --- |
| *.clerk.com | 3 | 1 | config_or_data | T1-auth-billing | clerk, third_party | vercel.json:28, vercel.json:28, vercel.json:28 |
| *.clerk.dev | 3 | 1 | config_or_data | T1-auth-billing | clerk, third_party | vercel.json:28, vercel.json:28, vercel.json:28 |
| *.vercel.app | 1 | 1 | config_or_data | T1-platform-control | third_party, vercel | vercel.json:28 |
| 127.0.0.1 | 1 | 1 | other | T3-content-static | third_party | Dockerfile:20 |
| 1password.com | 9 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:5, rules/cancel-policy-sources.json:10, rules/policy-sources.json:10 |
| accounts.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing | clerk, first_party | vercel.json:28 |
| api.axiom.co | 3 | 2 | other | T1-observability | axiom, third_party | lib/log.js:9, lib/metrics-axiom.js:65, lib/metrics-axiom.js:70 |
| bitwarden.com | 20 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:12, public/rules/policy-sources.json:34, public/rules/return-policy-sources.json:12 |
| bumble.com | 17 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:13, public/rules/policy-sources.json:38, public/rules/return-policy-sources.json:13 |
| cancel.decide.fyi | 11 | 6 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:22, README.md:36, README.md:52 |
| cdn.jsdelivr.net | 1 | 1 | config_or_data | T3-content-static | third_party | vercel.json:28 |
| challenges.cloudflare.com | 2 | 1 | config_or_data | T1-platform-control | cloudflare, third_party | vercel.json:28, vercel.json:28 |
| chrome.browserless.io | 2 | 2 | docs_content, other | T0-critical-runtime | browserless, third_party | README.md:396, api/policy-fetch-hook.js:168 |
| claude.ai | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:17, rules/trial-policy-confirmed-baseline.json:122, rules/trial-policy-coverage-state.json:315 |
| clerk.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing | clerk, first_party | vercel.json:28 |
| cursor.com | 1 | 1 | docs_content | T3-content-static | third_party | README.md:13 |
| customercenter.wsj.com | 15 | 12 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:591, rules/cancel-policy-coverage-state.json:1863, rules/cancel-policy-semantic-state.json:1333 |
| decide-1.vercel.app | 1 | 1 | docs_content | T1-platform-control | third_party, vercel | README.md:400 |
| decide.fyi | 1 | 1 | other | T2-first-party-surface | first_party | api/track.js:115 |
| discord.com | 25 | 14 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:150, rules/cancel-policy-semantic-state.json:309, rules/cancel-policy-sources.json:130 |
| docs.github.com | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:29, public/rules/policy-sources.json:102, public/rules/return-policy-sources.json:29 |
| docs.keeper.io | 3 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:290, rules/cancel-policy-semantic-state.json:1173, rules/cancel-policy-sources.json:511 |
| docs.midjourney.com | 19 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:42, public/rules/policy-sources.json:154, public/rules/return-policy-sources.json:42 |
| en-americas-support.nintendo.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:44, rules/cancel-policy-confirmed-baseline.json:374, rules/cancel-policy-coverage-state.json:1011 |
| en.help.roblox.com | 10 | 10 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:451, rules/cancel-policy-coverage-state.json:1771, rules/cancel-policy-semantic-state.json:1261 |
| evernote.com | 12 | 7 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:25, rules/cancel-policy-sources.json:177, rules/cancel-policy-sources.json:178 |
| example.com | 8 | 2 | docs_content, other | T3-content-static | third_party | README.md:383, scripts/test-check-policies.js:379, scripts/test-check-policies.js:380 |
| fastmcp.me | 4 | 1 | docs_content | T3-content-static | third_party | README.md:13, README.md:13, README.md:13 |
| fonts.googleapis.com | 1 | 1 | config_or_data | T3-content-static | google_fonts, third_party | vercel.json:28 |
| fonts.gstatic.com | 1 | 1 | config_or_data | T3-content-static | google_fonts, third_party | vercel.json:28 |
| generativelanguage.googleapis.com | 2 | 2 | config_or_data, other | T0-critical-runtime | gemini, third_party | api/decide.js:300, vercel.json:28 |
| github.com | 80 | 10 | config_or_data, data_source, frontend, other | T1-platform-control | github, third_party | public/index.html:344, public/rules/trial-policy-sources.json:29, rules/policy-alert-feed.json:117 |
| glama.ai | 1 | 1 | config_or_data | T3-content-static | third_party | glama.json:2 |
| hellofreshusa.zendesk.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:118, public/rules/return-policy-sources.json:33, rules/policy-confirmed-baseline.json:276 |
| help.audible.com | 9 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:11, rules/cancel-policy-confirmed-baseline.json:73, rules/cancel-policy-coverage-state.json:186 |
| help.britbox.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:87, rules/cancel-policy-semantic-state.json:1667, rules/cancel-policy-sources.json:672 |
| help.crunchyroll.com | 30 | 15 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:19, public/rules/policy-sources.json:62, public/rules/return-policy-sources.json:19 |
| help.discoveryplus.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:157, rules/cancel-policy-semantic-state.json:1418, rules/cancel-policy-sources.json:655 |
| help.disneyplus.com | 14 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:21, public/rules/policy-sources.json:70, public/rules/return-policy-sources.json:21 |
| help.doordash.com | 19 | 19 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:22, public/rules/policy-sources.json:74, public/rules/return-policy-sources.json:22 |
| help.dropbox.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:23, rules/cancel-policy-confirmed-baseline.json:171, rules/cancel-policy-coverage-state.json:520 |
| help.ea.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:178, rules/cancel-policy-coverage-state.json:1747, rules/cancel-policy-semantic-state.json:1227 |
| help.evernote.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:25, public/rules/policy-sources.json:86, public/rules/return-policy-sources.json:25 |
| help.example.com | 1 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:278 |
| help.hbomax.com | 10 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:146, public/rules/return-policy-sources.json:40, rules/policy-confirmed-baseline.json:346 |
| help.headspace.com | 16 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:32, public/rules/policy-sources.json:114, public/rules/return-policy-sources.json:32 |
| help.hinge.co | 16 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:34, public/rules/policy-sources.json:122, public/rules/return-policy-sources.json:34 |
| help.hulu.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:35, rules/cancel-policy-confirmed-baseline.json:269, rules/cancel-policy-sources.json:251 |
| help.max.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:40, rules/cancel-policy-confirmed-baseline.json:325, rules/cancel-policy-coverage-state.json:869 |
| help.netflix.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:43, public/rules/policy-sources.json:158, public/rules/return-policy-sources.json:43 |
| help.nytimes.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:360, rules/cancel-policy-semantic-state.json:1278, rules/cancel-policy-sources.json:597 |
| help.openai.com | 19 | 14 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:16, public/rules/policy-sources.json:50, public/rules/return-policy-sources.json:16 |
| help.paramountplus.com | 15 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:48, public/rules/policy-sources.json:178, public/rules/return-policy-sources.json:48 |
| help.snapchat.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:493, rules/cancel-policy-semantic-state.json:1367, rules/cancel-policy-sources.json:626 |
| help.soundcloud.com | 15 | 12 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:500, rules/cancel-policy-semantic-state.json:1452, rules/cancel-policy-sources.json:650 |
| help.starz.com | 1 | 1 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:666 |
| help.twitch.tv | 5 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:63, rules/cancel-policy-change-candidates.json:182, rules/cancel-policy-change-candidates.json:189 |
| help.x.com | 8 | 5 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-sources.json:638, rules/policy-sources.json:572, rules/return-policy-sources.json:572 |
| helpcenter.washingtonpost.com | 11 | 9 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:605, rules/cancel-policy-semantic-state.json:1350, rules/cancel-policy-sources.json:617 |
| hingeapp.zendesk.com | 8 | 7 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:34, rules/cancel-policy-sources.json:246, rules/policy-sources.json:242 |
| img.shields.io | 4 | 1 | docs_content | T3-content-static | third_party | README.md:5, README.md:6, README.md:7 |
| legal.ubi.com | 9 | 9 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:573, rules/policy-confirmed-baseline.json:626, rules/policy-coverage-state.json:1735 |
| legal.x.com | 16 | 14 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:626, rules/cancel-policy-semantic-state.json:1384, rules/cancel-policy-sources.json:630 |
| localhost | 2 | 2 | other | T3-content-static | third_party | api/compliance-export.js:11, scripts/mcp-check.sh:4 |
| nordvpn.com | 10 | 9 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/trial-policy-sources.json:46, rules/cancel-policy-sources.json:331, rules/policy-events.ndjson:36 |
| one.google.com | 20 | 16 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:227, rules/cancel-policy-coverage-state.json:622, rules/cancel-policy-semantic-state.json:1541 |
| openai.com | 9 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:16, rules/cancel-policy-sources.json:96, rules/policy-sources.json:91 |
| play.google.com | 2 | 2 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:30, rules/trial-policy-sources.json:210 |
| premium.linkedin.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:38, rules/trial-policy-confirmed-baseline.json:339, rules/trial-policy-coverage-state.json:881 |
| preview.example.com | 1 | 1 | docs_content | T3-content-static | third_party | docs/FIRST_CUSTOMER_RUNBOOK.md:39 |
| proton.me | 24 | 16 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:430, rules/cancel-policy-coverage-state.json:1120, rules/cancel-policy-semantic-state.json:779 |
| r.jina.ai | 2 | 2 | other | T0-critical-runtime | jina_mirror, third_party | api/policy-fetch-hook.js:95, scripts/check-policies.js:3082 |
| raw.githubusercontent.com | 2 | 1 | docs_content | T1-platform-control | github, third_party | client/EXAMPLES.md:84, client/EXAMPLES.md:102 |
| refund.decide.fyi | 20 | 10 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:21, README.md:35, README.md:47 |
| return.decide.fyi | 11 | 6 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:23, README.md:37, README.md:57 |
| ring.com | 24 | 16 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:444, rules/cancel-policy-coverage-state.json:1164, rules/cancel-policy-semantic-state.json:798 |
| secure.wsj-asia.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:613, rules/policy-sources.json:539, rules/return-policy-sources.json:539 |
| slack.com | 17 | 17 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:54, public/rules/policy-sources.json:202, public/rules/return-policy-sources.json:54 |
| smithery.ai | 1 | 1 | docs_content | T3-content-static | third_party | DISTRIBUTION.md:11 |
| soundcloud.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:592, rules/return-policy-sources.json:592, rules/trial-policy-sources.json:571 |
| static.modelcontextprotocol.io | 1 | 1 | config_or_data | T3-content-static | third_party | server.json:2 |
| store.playstation.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:51, rules/trial-policy-confirmed-baseline.json:465, rules/trial-policy-coverage-state.json:1206 |
| store.ubisoft.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/trial-policy-confirmed-baseline.json:633, rules/trial-policy-coverage-state.json:1850, rules/trial-policy-semantic-state.json:1357 |
| substack.com | 6 | 3 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:554, rules/policy-sources.json:555, rules/return-policy-sources.json:554 |
| support.1password.com | 17 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:5, public/rules/policy-sources.json:6, public/rules/return-policy-sources.json:5 |
| support.amcplus.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:38, rules/cancel-policy-semantic-state.json:1490, rules/cancel-policy-sources.json:676 |
| support.anthropic.com | 8 | 7 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:17, rules/cancel-policy-confirmed-baseline.json:115, rules/cancel-policy-semantic-state.json:237 |
| support.apple.com | 60 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:8, public/rules/cancel-policy-sources.json:9, public/rules/cancel-policy-sources.json:10 |
| support.calm.com | 17 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:14, public/rules/policy-sources.json:42, public/rules/return-policy-sources.json:14 |
| support.claude.com | 10 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:54, public/rules/return-policy-sources.json:17, rules/policy-confirmed-baseline.json:122 |
| support.dashlane.com | 11 | 9 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:136, rules/cancel-policy-semantic-state.json:1137, rules/cancel-policy-sources.json:495 |
| support.duolingo.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:24, rules/cancel-policy-semantic-state.json:351, rules/cancel-policy-sources.json:162 |
| support.fubo.tv | 19 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:28, public/rules/policy-sources.json:98, public/rules/return-policy-sources.json:28 |
| support.google.com | 41 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:30, public/rules/cancel-policy-sources.json:67, public/rules/policy-sources.json:106 |
| support.grammarly.com | 18 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:31, public/rules/policy-sources.json:110, public/rules/return-policy-sources.json:31 |
| support.lastpass.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:304, rules/cancel-policy-sources.json:499 |
| support.microsoft.com | 16 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:41, public/rules/policy-sources.json:150, public/rules/return-policy-sources.json:41 |
| support.myfitnesspal.com | 13 | 10 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:346, rules/cancel-policy-semantic-state.json:1154, rules/cancel-policy-sources.json:528 |
| support.nfl.com | 4 | 4 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:367, rules/cancel-policy-semantic-state.json:1316, rules/cancel-policy-sources.json:585 |
| support.nordvpn.com | 16 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:46, public/rules/policy-sources.json:170, public/rules/return-policy-sources.json:46 |
| support.onepeloton.com | 1 | 1 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:50 |
| support.patreon.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:402, rules/cancel-policy-coverage-state.json:1700, rules/cancel-policy-semantic-state.json:1684 |
| support.reddithelp.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:437, rules/cancel-policy-coverage-state.json:1972, rules/cancel-policy-semantic-state.json:1401 |
| support.scribd.com | 14 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:52, public/rules/policy-sources.json:194, public/rules/return-policy-sources.json:52 |
| support.spotify.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:56, rules/cancel-policy-confirmed-baseline.json:507, rules/cancel-policy-semantic-state.json:855 |
| support.squarespace.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:57, public/rules/policy-sources.json:214, public/rules/return-policy-sources.json:57 |
| support.strava.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:58, rules/cancel-policy-confirmed-baseline.json:528, rules/cancel-policy-semantic-state.json:935 |
| support.substack.com | 13 | 13 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:535, rules/cancel-policy-semantic-state.json:1701, rules/cancel-policy-sources.json:621 |
| support.surfshark.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:59, public/rules/policy-sources.json:222, public/rules/return-policy-sources.json:59 |
| support.tidal.com | 16 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:60, public/rules/policy-sources.json:226, public/rules/return-policy-sources.json:60 |
| support.wix.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:65, public/rules/policy-sources.json:246, public/rules/return-policy-sources.json:65 |
| support.xbox.com | 15 | 13 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:66, public/rules/policy-sources.json:250, public/rules/return-policy-sources.json:66 |
| support.zoom.com | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:68, public/rules/policy-sources.json:258, public/rules/return-policy-sources.json:68 |
| surfshark.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:59, rules/trial-policy-confirmed-baseline.json:584, rules/trial-policy-coverage-state.json:1396 |
| telegram.org | 17 | 15 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:549, rules/cancel-policy-coverage-state.json:2012, rules/cancel-policy-semantic-state.json:1435 |
| tidal.com | 8 | 7 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:60, rules/cancel-policy-sources.json:433, rules/policy-sources.json:404 |
| tinder.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:61, rules/trial-policy-confirmed-baseline.json:605, rules/trial-policy-coverage-state.json:1418 |
| todoist.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:62, rules/trial-policy-confirmed-baseline.json:612, rules/trial-policy-coverage-state.json:1440 |
| trial.decide.fyi | 11 | 6 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:24, README.md:38, README.md:62 |
| tv.youtube.com | 18 | 16 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-change-candidates.json:235, rules/cancel-policy-change-candidates.json:242, rules/cancel-policy-coverage-state.json:1527 |
| www.adobe.com | 16 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:6, public/rules/policy-sources.json:10, public/rules/return-policy-sources.json:6 |
| www.amazon.com | 79 | 21 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:7, public/rules/policy-sources.json:14, public/rules/return-policy-sources.json:7 |
| www.amcplus.com | 10 | 10 | config_or_data | T3-content-static | third_party | rules/policy-confirmed-baseline.json:38, rules/policy-semantic-state.json:1654, rules/policy-sources.json:614 |
| www.anthropic.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:104, rules/policy-sources.json:99, rules/return-policy-sources.json:99 |
| www.apple.com | 27 | 15 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/trial-policy-sources.json:9, public/rules/trial-policy-sources.json:10, rules/cancel-policy-confirmed-baseline.json:52 |
| www.audible.com | 17 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:30, public/rules/return-policy-sources.json:11, public/rules/trial-policy-sources.json:11 |
| www.britbox.com | 11 | 11 | config_or_data, other | T3-content-static | third_party | rules/policy-confirmed-baseline.json:87, rules/policy-events.ndjson:24, rules/policy-semantic-state.json:1634 |
| www.calm.com | 9 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:14, rules/cancel-policy-sources.json:75, rules/policy-sources.json:75 |
| www.canva.com | 27 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:15, public/rules/policy-sources.json:46, public/rules/return-policy-sources.json:15 |
| www.coursera.org | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:18, rules/trial-policy-confirmed-baseline.json:129, rules/trial-policy-semantic-state.json:271 |
| www.coursera.support | 15 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:18, public/rules/policy-sources.json:58, public/rules/return-policy-sources.json:18 |
| www.crunchyroll.com | 6 | 6 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/trial-policy-sources.json:19, rules/policy-events.ndjson:21, rules/trial-policy-confirmed-baseline.json:136 |
| www.dashlane.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:461, rules/return-policy-sources.json:461, rules/trial-policy-confirmed-baseline.json:143 |
| www.decide.fyi | 7 | 4 | docs_content, other | T2-first-party-surface | first_party | README.md:409, docs/FIRST_CUSTOMER_RUNBOOK.md:17, docs/FIRST_CUSTOMER_RUNBOOK.md:49 |
| www.deezer.com | 17 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:20, public/rules/policy-sources.json:66, public/rules/return-policy-sources.json:20 |
| www.discoveryplus.com | 11 | 10 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:658, rules/cancel-policy-sources.json:659, rules/policy-confirmed-baseline.json:164 |
| www.disneyplus.com | 18 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:21, rules/cancel-policy-sources.json:146, rules/cancel-policy-sources.json:170 |
| www.doordash.com | 3 | 2 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:22, rules/trial-policy-sources.json:140, rules/trial-policy-sources.json:141 |
| www.dropbox.com | 21 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:78, public/rules/return-policy-sources.json:23, public/rules/trial-policy-sources.json:23 |
| www.duolingo.com | 15 | 14 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/policy-sources.json:82, public/rules/return-policy-sources.json:24, public/rules/trial-policy-sources.json:24 |
| www.ea.com | 12 | 12 | config_or_data | T3-content-static | third_party | rules/policy-confirmed-baseline.json:192, rules/policy-coverage-state.json:1711, rules/policy-semantic-state.json:1348 |
| www.espn.com | 20 | 16 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:185, rules/cancel-policy-coverage-state.json:477, rules/cancel-policy-semantic-state.json:1524 |
| www.example.com | 2 | 1 | other | T3-content-static | third_party | scripts/test-check-policies.js:272, scripts/test-check-policies.js:284 |
| www.expressvpn.com | 25 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:26, public/rules/policy-sources.json:90, public/rules/return-policy-sources.json:26 |
| www.figma.com | 17 | 17 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:27, public/rules/policy-sources.json:94, public/rules/return-policy-sources.json:27 |
| www.fitbit.com | 11 | 11 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:524, rules/policy-confirmed-baseline.json:227, rules/policy-semantic-state.json:1249 |
| www.fubo.tv | 8 | 7 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:28, rules/cancel-policy-sources.json:197, rules/policy-sources.json:193 |
| www.grammarly.com | 8 | 7 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:31, rules/cancel-policy-sources.json:223, rules/policy-sources.json:219 |
| www.headspace.com | 8 | 7 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:32, rules/cancel-policy-sources.json:231, rules/policy-sources.json:227 |
| www.hellofresh.com | 18 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:33, public/rules/trial-policy-sources.json:33, rules/cancel-policy-confirmed-baseline.json:255 |
| www.help.tinder.com | 25 | 16 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:61, public/rules/policy-sources.json:230, public/rules/return-policy-sources.json:61 |
| www.hulu.com | 18 | 18 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/policy-sources.json:126, public/rules/return-policy-sources.json:35, public/rules/trial-policy-sources.json:35 |
| www.instacart.com | 24 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:37, public/rules/policy-sources.json:134, public/rules/return-policy-sources.json:37 |
| www.keepersecurity.com | 10 | 10 | config_or_data | T3-content-static | third_party | rules/policy-confirmed-baseline.json:311, rules/policy-semantic-state.json:1269, rules/policy-sources.json:469 |
| www.lastpass.com | 15 | 14 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:1116, rules/cancel-policy-sources.json:507, rules/policy-confirmed-baseline.json:325 |
| www.linkedin.com | 14 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:38, public/rules/policy-sources.json:138, public/rules/return-policy-sources.json:38 |
| www.masterclass.com | 28 | 20 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:39, public/rules/policy-sources.json:142, public/rules/return-policy-sources.json:39 |
| www.max.com | 6 | 6 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/trial-policy-sources.json:40, rules/policy-events.ndjson:23, rules/trial-policy-confirmed-baseline.json:353 |
| www.microsoft.com | 9 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:41, rules/cancel-policy-sources.json:303, rules/policy-sources.json:291 |
| www.midjourney.com | 9 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:42, rules/cancel-policy-sources.json:312, rules/policy-sources.json:300 |
| www.mlb.com | 22 | 15 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-change-candidates.json:344, rules/cancel-policy-change-candidates.json:351, rules/cancel-policy-coverage-state.json:1799 |
| www.myfitnesspal.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:487, rules/return-policy-sources.json:487, rules/trial-policy-confirmed-baseline.json:381 |
| www.netflix.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:43, rules/trial-policy-confirmed-baseline.json:388, rules/trial-policy-coverage-state.json:977 |
| www.nfl.com | 12 | 12 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-sources.json:577, rules/policy-confirmed-baseline.json:395, rules/policy-semantic-state.json:1431 |
| www.nintendo.com | 13 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:162, public/rules/return-policy-sources.json:44, public/rules/trial-policy-sources.json:44 |
| www.noom.com | 16 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:45, public/rules/policy-sources.json:166, public/rules/return-policy-sources.json:45 |
| www.notion.com | 5 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:395, rules/cancel-policy-semantic-state.json:714, rules/cancel-policy-sources.json:336 |
| www.notion.so | 14 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:47, public/rules/policy-sources.json:174, public/rules/return-policy-sources.json:47 |
| www.nytimes.com | 10 | 10 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:605, rules/policy-confirmed-baseline.json:388, rules/policy-semantic-state.json:1450 |
| www.onepeloton.com | 17 | 15 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:186, public/rules/return-policy-sources.json:50, public/rules/trial-policy-sources.json:50 |
| www.paramountplus.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:48, rules/cancel-policy-sources.json:344, rules/cancel-policy-sources.json:353 |
| www.patreon.com | 12 | 11 | config_or_data, other | T3-content-static | third_party | rules/policy-confirmed-baseline.json:437, rules/policy-events.ndjson:5, rules/policy-events.ndjson:17 |
| www.peacocktv.com | 26 | 18 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:49, public/rules/policy-sources.json:182, public/rules/return-policy-sources.json:49 |
| www.playstation.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:51, public/rules/policy-sources.json:190, public/rules/return-policy-sources.json:51 |
| www.reddit.com | 9 | 9 | config_or_data | T3-content-static | third_party | rules/policy-confirmed-baseline.json:472, rules/policy-semantic-state.json:1540, rules/policy-sources.json:576 |
| www.redditinc.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:580, rules/return-policy-sources.json:580 |
| www.roblox.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/trial-policy-confirmed-baseline.json:493, rules/trial-policy-coverage-state.json:1828, rules/trial-policy-semantic-state.json:1323 |
| www.scribd.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:52, rules/trial-policy-confirmed-baseline.json:500, rules/trial-policy-coverage-state.json:1229 |
| www.shutterstock.com | 26 | 18 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:53, public/rules/policy-sources.json:198, public/rules/return-policy-sources.json:53 |
| www.siriusxm.com | 21 | 15 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:472, rules/cancel-policy-semantic-state.json:1190, rules/cancel-policy-sources.json:545 |
| www.sling.com | 17 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:55, public/rules/policy-sources.json:206, public/rules/return-policy-sources.json:55 |
| www.snap.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-confirmed-baseline.json:528, rules/policy-semantic-state.json:1503, rules/policy-sources.json:560 |
| www.snapchat.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/trial-policy-confirmed-baseline.json:535, rules/trial-policy-semantic-state.json:1498, rules/trial-policy-sources.json:532 |
| www.spotify.com | 13 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:210, public/rules/return-policy-sources.json:56, public/rules/trial-policy-sources.json:56 |
| www.squarespace.com | 4 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:57, rules/trial-policy-confirmed-baseline.json:556, rules/trial-policy-semantic-state.json:984 |
| www.starz.com | 19 | 12 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:521, rules/cancel-policy-semantic-state.json:1469, rules/cancel-policy-sources.json:663 |
| www.strava.com | 13 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:218, public/rules/return-policy-sources.json:58, public/rules/trial-policy-sources.json:58 |
| www.todoist.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:62, public/rules/policy-sources.json:234, public/rules/return-policy-sources.json:62 |
| www.twitch.tv | 15 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:238, public/rules/return-policy-sources.json:63, public/rules/trial-policy-sources.json:63 |
| www.uber.com | 20 | 12 | config_or_data | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:577, rules/cancel-policy-semantic-state.json:1020, rules/cancel-policy-sources.json:463 |
| www.ubisoft.com | 4 | 4 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:584, rules/cancel-policy-semantic-state.json:1244, rules/cancel-policy-sources.json:565 |
| www.w3.org | 1 | 1 | frontend | T3-content-static | third_party | public/index.html:9 |
| www.walmart.com | 16 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:64, public/rules/policy-sources.json:242, public/rules/return-policy-sources.json:64 |
| www.washingtonpost.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:547, rules/return-policy-sources.json:547, rules/trial-policy-confirmed-baseline.json:654 |
| www.weightwatchers.com | 18 | 17 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-confirmed-baseline.json:612, rules/cancel-policy-coverage-state.json:1676, rules/cancel-policy-semantic-state.json:1210 |
| www.wix.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:65, rules/trial-policy-confirmed-baseline.json:668, rules/trial-policy-coverage-state.json:1567 |
| www.wsj.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/trial-policy-confirmed-baseline.json:640, rules/trial-policy-coverage-state.json:1958, rules/trial-policy-semantic-state.json:1425 |
| www.xbox.com | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:66, rules/trial-policy-confirmed-baseline.json:682, rules/trial-policy-coverage-state.json:1544 |
| www.youtube.com | 10 | 9 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/trial-policy-sources.json:67, rules/cancel-policy-sources.json:490, rules/policy-events.ndjson:32 |
| x.com | 3 | 2 | config_or_data, docs_content | T3-content-static | third_party | README.md:404, README.md:414, rules/trial-policy-sources.json:544 |
| zoom.us | 5 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:68, rules/trial-policy-confirmed-baseline.json:703, rules/trial-policy-coverage-state.json:2209 |

## 4) Generation Method

```bash
./scripts/generate-project-inventory.sh
```

- URLs are host-normalized (`URL.hostname`) with cleanup for comma-separated URL strings.
- Risk tiers are rule-based and prioritized from runtime-critical to content/static.
- Parse failures are listed in `OUTBOUND_URL_PARSE_ISSUES.md`.
