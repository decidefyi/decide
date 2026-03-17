# Outbound Domain Inventory (Exhaustive)

Generated: 2026-03-06T16:56:38.650Z

Repository: `decide`

This inventory includes all detected `http/https` outbound URLs across runtime code, frontend content, docs, and scripts in this repository.

Lockfiles and binary image assets are excluded to reduce noise.

## 1) Snapshot

- Total URL occurrences scanned: **1727**
- Valid URL occurrences parsed: **1721**
- Invalid/truncated URL occurrences: **6**
- Unique hosts: **198**
- Critical integration hosts: **13**
- First-party hosts: **7**
- Third-party hosts: **191**

### Risk-tier distribution

- T0-critical-runtime: 3
- T1-auth-billing: 4
- T1-observability: 1
- T1-platform-control: 5
- T2-first-party-surface: 5
- T3-content-static: 180

### Top hosts by URL occurrences

| Host | URL occurrences | Files | Risk tier | Tag(s) |
| --- | ---: | ---: | --- | --- |
| doi.org | 96 | 3 | T3-content-static | third_party |
| www.amazon.com | 55 | 14 | T3-content-static | third_party |
| support.apple.com | 46 | 12 | T3-content-static | third_party |
| support.google.com | 33 | 13 | T3-content-static | third_party |
| github.com | 26 | 7 | T1-platform-control | github, third_party |
| help.crunchyroll.com | 24 | 13 | T3-content-static | third_party |
| www.espn.com | 24 | 16 | T3-content-static | third_party |
| www.peacocktv.com | 23 | 14 | T3-content-static | third_party |
| help.openai.com | 22 | 16 | T3-content-static | third_party |
| www.canva.com | 22 | 13 | T3-content-static | third_party |
| www.expressvpn.com | 20 | 12 | T3-content-static | third_party |
| www.instacart.com | 20 | 12 | T3-content-static | third_party |
| www.masterclass.com | 20 | 12 | T3-content-static | third_party |
| www.shutterstock.com | 20 | 12 | T3-content-static | third_party |
| proton.me | 19 | 10 | T3-content-static | third_party |
| help.x.com | 18 | 13 | T3-content-static | third_party |
| refund.decide.fyi | 18 | 8 | T2-first-party-surface | first_party |
| www.apple.com | 18 | 9 | T3-content-static | third_party |
| www.dropbox.com | 17 | 10 | T3-content-static | third_party |
| www.help.tinder.com | 17 | 10 | T3-content-static | third_party |

## 2) Critical Integration Domains

These are domains tagged as runtime/ops critical (`vercel`, `github`, `stripe`, `resend`, `uptimerobot`, `browserless`, `jina_mirror`, `gemini`, `clerk`, `supabase`, `axiom`, `calendly`, `cloudflare`).

| Host | URL occurrences | Files | Context(s) | Risk tier | Tag(s) | Example references |
| --- | ---: | ---: | --- | --- | --- | --- |
| github.com | 26 | 7 | config_or_data, data_source, frontend, other | T1-platform-control (Platform/control-plane dependency.) | github, third_party | public/index.html:209, public/rules/trial-policy-sources.json:29, rules/policy-alert-feed.json:125 |
| *.clerk.com | 3 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, third_party | vercel.json:28, vercel.json:28, vercel.json:28 |
| *.clerk.dev | 3 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, third_party | vercel.json:28, vercel.json:28, vercel.json:28 |
| api.axiom.co | 3 | 2 | other | T1-observability (Monitoring/logging dependency.) | axiom, third_party | lib/log.js:9, lib/metrics-axiom.js:65, lib/metrics-axiom.js:70 |
| challenges.cloudflare.com | 2 | 1 | config_or_data | T1-platform-control (Platform/control-plane dependency.) | cloudflare, third_party | vercel.json:28, vercel.json:28 |
| chrome.browserless.io | 2 | 2 | docs_content, other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | browserless, third_party | README.md:386, api/policy-fetch-hook.js:168 |
| generativelanguage.googleapis.com | 2 | 2 | config_or_data, other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | gemini, third_party | api/decide.js:267, vercel.json:28 |
| r.jina.ai | 2 | 2 | other | T0-critical-runtime (Direct runtime dependency for decisioning/fetch/storage.) | jina_mirror, third_party | api/policy-fetch-hook.js:95, scripts/check-policies.js:1488 |
| raw.githubusercontent.com | 2 | 1 | docs_content | T1-platform-control (Platform/control-plane dependency.) | github, third_party | client/EXAMPLES.md:84, client/EXAMPLES.md:102 |
| *.vercel.app | 1 | 1 | config_or_data | T1-platform-control (Platform/control-plane dependency.) | third_party, vercel | vercel.json:28 |
| accounts.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, first_party | vercel.json:28 |
| clerk.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing (Auth, payment, or customer-contact dependency.) | clerk, first_party | vercel.json:28 |
| decide-1.vercel.app | 1 | 1 | docs_content | T1-platform-control (Platform/control-plane dependency.) | third_party, vercel | README.md:390 |

## 3) Full Host Inventory (Alphabetical, Exhaustive)

| Host | URL occurrences | Files | Context(s) | Risk tier | Tag(s) | Example references |
| --- | ---: | ---: | --- | --- | --- | --- |
| *.clerk.com | 3 | 1 | config_or_data | T1-auth-billing | clerk, third_party | vercel.json:28, vercel.json:28, vercel.json:28 |
| *.clerk.dev | 3 | 1 | config_or_data | T1-auth-billing | clerk, third_party | vercel.json:28, vercel.json:28, vercel.json:28 |
| *.vercel.app | 1 | 1 | config_or_data | T1-platform-control | third_party, vercel | vercel.json:28 |
| 1password.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:5, rules/cancel-policy-sources.json:10, rules/policy-sources.json:10 |
| accounts.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing | clerk, first_party | vercel.json:28 |
| api.axiom.co | 3 | 2 | other | T1-observability | axiom, third_party | lib/log.js:9, lib/metrics-axiom.js:65, lib/metrics-axiom.js:70 |
| bitwarden.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:12, public/rules/policy-sources.json:34, public/rules/return-policy-sources.json:12 |
| bumble.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:13, public/rules/policy-sources.json:38, public/rules/return-policy-sources.json:13 |
| cancel.decide.fyi | 10 | 5 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:20, README.md:34, README.md:50 |
| cdn.jsdelivr.net | 1 | 1 | config_or_data | T3-content-static | third_party | vercel.json:28 |
| challenges.cloudflare.com | 2 | 1 | config_or_data | T1-platform-control | cloudflare, third_party | vercel.json:28, vercel.json:28 |
| chrome.browserless.io | 2 | 2 | docs_content, other | T0-critical-runtime | browserless, third_party | README.md:386, api/policy-fetch-hook.js:168 |
| claude.ai | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:17, rules/trial-policy-semantic-state.json:83, rules/trial-policy-sources.json:95 |
| clerk.decide.fyi | 1 | 1 | config_or_data | T1-auth-billing | clerk, first_party | vercel.json:28 |
| cursor.com | 1 | 1 | docs_content | T3-content-static | third_party | README.md:11 |
| customercenter.wsj.com | 9 | 6 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:535, rules/cancel-policy-sources.json:514, rules/cancel-policy-sources.json:517 |
| decide-1.vercel.app | 1 | 1 | docs_content | T1-platform-control | third_party, vercel | README.md:390 |
| decide.fyi | 2 | 2 | docs_content, other | T2-first-party-surface | first_party | README.md:408, api/track.js:115 |
| discord.com | 16 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:132, rules/cancel-policy-sources.json:119, rules/cancel-policy-sources.json:122 |
| docs.github.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:29, public/rules/policy-sources.json:102, public/rules/return-policy-sources.json:29 |
| docs.keeper.io | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:476, rules/cancel-policy-sources.json:458 |
| docs.midjourney.com | 16 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:42, public/rules/policy-sources.json:154, public/rules/return-policy-sources.json:42 |
| doi.org | 96 | 3 | docs_content | T3-content-static | third_party | docs/academic/decide-thesis-docx-source.txt:365, docs/academic/decide-thesis-docx-source.txt:367, docs/academic/decide-thesis-docx-source.txt:369 |
| en-americas-support.nintendo.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:44, rules/cancel-policy-semantic-state.json:283, rules/cancel-policy-sources.json:293 |
| en.help.roblox.com | 8 | 7 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:511, rules/cancel-policy-sources.json:486, rules/policy-semantic-state.json:592 |
| evernote.com | 11 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:25, rules/cancel-policy-sources.json:158, rules/cancel-policy-sources.json:159 |
| example.com | 3 | 2 | docs_content, other | T3-content-static | third_party | README.md:373, scripts/test-check-policies.js:42, scripts/test-check-policies.js:43 |
| fastmcp.me | 4 | 1 | docs_content | T3-content-static | third_party | README.md:11, README.md:11, README.md:11 |
| fonts.googleapis.com | 1 | 1 | config_or_data | T3-content-static | google_fonts, third_party | vercel.json:28 |
| fonts.gstatic.com | 1 | 1 | config_or_data | T3-content-static | google_fonts, third_party | vercel.json:28 |
| generativelanguage.googleapis.com | 2 | 2 | config_or_data, other | T0-critical-runtime | gemini, third_party | api/decide.js:267, vercel.json:28 |
| github.com | 26 | 7 | config_or_data, data_source, frontend, other | T1-platform-control | github, third_party | public/index.html:209, public/rules/trial-policy-sources.json:29, rules/policy-alert-feed.json:125 |
| hellofreshusa.zendesk.com | 6 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:118, public/rules/return-policy-sources.json:33, rules/policy-semantic-state.json:753 |
| help.audible.com | 10 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:11, rules/cancel-policy-change-candidates.json:9, rules/cancel-policy-change-candidates.json:16 |
| help.britbox.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:663, rules/cancel-policy-sources.json:569 |
| help.crunchyroll.com | 24 | 13 | config_or_data, data_source, other | T3-content-static | third_party | public/rules/cancel-policy-sources.json:19, public/rules/policy-sources.json:62, public/rules/return-policy-sources.json:19 |
| help.discoveryplus.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:568, rules/cancel-policy-sources.json:552 |
| help.disneyplus.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:21, public/rules/policy-sources.json:70, public/rules/return-policy-sources.json:21 |
| help.doordash.com | 11 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:22, public/rules/policy-sources.json:74, public/rules/return-policy-sources.json:22 |
| help.dropbox.com | 6 | 5 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:23, rules/cancel-policy-change-candidates.json:87, rules/cancel-policy-change-candidates.json:94 |
| help.ea.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:497, rules/cancel-policy-sources.json:490 |
| help.evernote.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:25, public/rules/policy-sources.json:86, public/rules/return-policy-sources.json:25 |
| help.hbomax.com | 6 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:146, public/rules/return-policy-sources.json:40, rules/policy-semantic-state.json:247 |
| help.headspace.com | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:32, public/rules/policy-sources.json:114, public/rules/return-policy-sources.json:32 |
| help.hinge.co | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:34, public/rules/policy-sources.json:122, public/rules/return-policy-sources.json:34 |
| help.hulu.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:35, rules/cancel-policy-semantic-state.json:201, rules/cancel-policy-sources.json:232 |
| help.max.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:40, rules/cancel-policy-semantic-state.json:239, rules/cancel-policy-sources.json:269 |
| help.netflix.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:43, public/rules/policy-sources.json:158, public/rules/return-policy-sources.json:43 |
| help.nytimes.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:517, rules/cancel-policy-sources.json:510 |
| help.openai.com | 22 | 16 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:16, public/rules/policy-sources.json:50, public/rules/return-policy-sources.json:16 |
| help.paramountplus.com | 11 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:48, public/rules/policy-sources.json:178, public/rules/return-policy-sources.json:48 |
| help.snapchat.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:547, rules/cancel-policy-sources.json:531 |
| help.soundcloud.com | 11 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:580, rules/cancel-policy-sources.json:547, rules/policy-semantic-state.json:682 |
| help.starz.com | 1 | 1 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:563 |
| help.twitch.tv | 5 | 4 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:63, rules/cancel-policy-change-candidates.json:163, rules/cancel-policy-change-candidates.json:170 |
| help.x.com | 18 | 13 | config_or_data, other | T3-content-static | third_party | rules/cancel-policy-change-candidates.json:201, rules/cancel-policy-change-candidates.json:208, rules/cancel-policy-coverage-state.json:1315 |
| helpcenter.washingtonpost.com | 8 | 6 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:541, rules/cancel-policy-sources.json:522, rules/policy-semantic-state.json:759 |
| hingeapp.zendesk.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:34, rules/cancel-policy-sources.json:227, rules/policy-sources.json:227 |
| img.shields.io | 4 | 1 | docs_content | T3-content-static | third_party | README.md:5, README.md:6, README.md:7 |
| legal.ubi.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:583, rules/policy-sources.json:490, rules/return-policy-semantic-state.json:563 |
| localhost | 2 | 2 | other | T3-content-static | third_party | api/compliance-export.js:11, scripts/mcp-check.sh:4 |
| nordvpn.com | 10 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:46, rules/cancel-policy-sources.json:304, rules/policy-sources.json:304 |
| one.google.com | 12 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:614, rules/cancel-policy-sources.json:187, rules/cancel-policy-sources.json:190 |
| openai.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:16, rules/cancel-policy-sources.json:91, rules/policy-sources.json:91 |
| papers.nips.cc | 6 | 3 | docs_content | T3-content-static | third_party | docs/academic/decide-thesis-docx-source.txt:397, docs/academic/decide-thesis-docx-source.txt:422, docs/academic/decide-thesis-journal-manuscript.md:394 |
| play.google.com | 2 | 2 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:30, rules/trial-policy-sources.json:204 |
| premium.linkedin.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:38, rules/trial-policy-semantic-state.json:242, rules/trial-policy-sources.json:264 |
| proton.me | 19 | 10 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:321, rules/cancel-policy-sources.json:341, rules/cancel-policy-sources.json:344 |
| r.jina.ai | 2 | 2 | other | T0-critical-runtime | jina_mirror, third_party | api/policy-fetch-hook.js:95, scripts/check-policies.js:1488 |
| raw.githubusercontent.com | 2 | 1 | docs_content | T1-platform-control | github, third_party | client/EXAMPLES.md:84, client/EXAMPLES.md:102 |
| refund.decide.fyi | 18 | 8 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:19, README.md:33, README.md:45 |
| return.decide.fyi | 10 | 5 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:21, README.md:35, README.md:55 |
| ring.com | 16 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:329, rules/cancel-policy-sources.json:349, rules/cancel-policy-sources.json:352 |
| secure.wsj-asia.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:518, rules/policy-sources.json:514, rules/return-policy-sources.json:514 |
| slack.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:54, public/rules/policy-sources.json:202, public/rules/return-policy-sources.json:54 |
| smithery.ai | 1 | 1 | docs_content | T3-content-static | third_party | DISTRIBUTION.md:11 |
| soundcloud.com | 3 | 3 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:559, rules/return-policy-sources.json:559, rules/trial-policy-sources.json:547 |
| static.modelcontextprotocol.io | 1 | 1 | config_or_data | T3-content-static | third_party | server.json:2 |
| store.playstation.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:51, rules/trial-policy-semantic-state.json:318, rules/trial-policy-sources.json:337 |
| store.ubisoft.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/trial-policy-semantic-state.json:512, rules/trial-policy-sources.json:493 |
| substack.com | 6 | 3 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:529, rules/policy-sources.json:530, rules/return-policy-sources.json:529 |
| support.1password.com | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:5, public/rules/policy-sources.json:6, public/rules/return-policy-sources.json:5 |
| support.amcplus.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:596, rules/cancel-policy-sources.json:573 |
| support.anthropic.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:17, rules/cancel-policy-semantic-state.json:104, rules/cancel-policy-sources.json:95 |
| support.apple.com | 46 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:8, public/rules/cancel-policy-sources.json:9, public/rules/cancel-policy-sources.json:10 |
| support.calm.com | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:14, public/rules/policy-sources.json:42, public/rules/return-policy-sources.json:14 |
| support.claude.com | 6 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:54, public/rules/return-policy-sources.json:17, rules/policy-semantic-state.json:722 |
| support.dashlane.com | 8 | 6 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:464, rules/cancel-policy-sources.json:450, rules/policy-semantic-state.json:529 |
| support.duolingo.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:24, rules/cancel-policy-semantic-state.json:150, rules/cancel-policy-sources.json:143 |
| support.fubo.tv | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:28, public/rules/policy-sources.json:98, public/rules/return-policy-sources.json:28 |
| support.google.com | 33 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:30, public/rules/cancel-policy-sources.json:67, public/rules/policy-sources.json:106 |
| support.grammarly.com | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:31, public/rules/policy-sources.json:110, public/rules/return-policy-sources.json:31 |
| support.lastpass.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:458, rules/cancel-policy-sources.json:454 |
| support.microsoft.com | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:41, public/rules/policy-sources.json:150, public/rules/return-policy-sources.json:41 |
| support.myfitnesspal.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:470, rules/cancel-policy-sources.json:466 |
| support.nfl.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:529, rules/cancel-policy-sources.json:498 |
| support.nordvpn.com | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:46, public/rules/policy-sources.json:170, public/rules/return-policy-sources.json:46 |
| support.onepeloton.com | 1 | 1 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:50 |
| support.patreon.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:669, rules/cancel-policy-sources.json:482 |
| support.reddithelp.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:562, rules/cancel-policy-sources.json:539, rules/policy-sources.json:546 |
| support.scribd.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:52, public/rules/policy-sources.json:194, public/rules/return-policy-sources.json:52 |
| support.spotify.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:56, rules/cancel-policy-semantic-state.json:353, rules/cancel-policy-sources.json:378 |
| support.squarespace.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:57, public/rules/policy-sources.json:214, public/rules/return-policy-sources.json:57 |
| support.strava.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:58, rules/cancel-policy-semantic-state.json:389, rules/cancel-policy-sources.json:386 |
| support.substack.com | 11 | 10 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:675, rules/cancel-policy-sources.json:526, rules/policy-semantic-state.json:632 |
| support.surfshark.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:59, public/rules/policy-sources.json:222, public/rules/return-policy-sources.json:59 |
| support.tidal.com | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:60, public/rules/policy-sources.json:226, public/rules/return-policy-sources.json:60 |
| support.wix.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:65, public/rules/policy-sources.json:246, public/rules/return-policy-sources.json:65 |
| support.xbox.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:66, public/rules/policy-sources.json:250, public/rules/return-policy-sources.json:66 |
| support.zoom.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:68, public/rules/policy-sources.json:258, public/rules/return-policy-sources.json:68 |
| surfshark.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:59, rules/trial-policy-semantic-state.json:378, rules/trial-policy-sources.json:393 |
| telegram.org | 8 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:574, rules/cancel-policy-sources.json:543, rules/policy-semantic-state.json:665 |
| tidal.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:60, rules/cancel-policy-sources.json:397, rules/policy-sources.json:389 |
| tinder.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:61, rules/trial-policy-semantic-state.json:384, rules/trial-policy-sources.json:405 |
| todoist.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:62, rules/trial-policy-semantic-state.json:390, rules/trial-policy-sources.json:413 |
| trial.decide.fyi | 10 | 5 | config_or_data, docs_content, frontend, other | T2-first-party-surface | first_party | README.md:22, README.md:36, README.md:60 |
| tv.youtube.com | 8 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:448, rules/cancel-policy-sources.json:442, rules/policy-semantic-state.json:511 |
| www.adobe.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:6, public/rules/policy-sources.json:10, public/rules/return-policy-sources.json:6 |
| www.amazon.com | 55 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:7, public/rules/policy-sources.json:14, public/rules/return-policy-sources.json:7 |
| www.amcplus.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:707, rules/policy-sources.json:581, rules/return-policy-semantic-state.json:675 |
| www.anthropic.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:99, rules/policy-sources.json:99, rules/return-policy-sources.json:99 |
| www.apple.com | 18 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:9, public/rules/trial-policy-sources.json:10, rules/cancel-policy-semantic-state.json:38 |
| www.audible.com | 13 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:30, public/rules/return-policy-sources.json:11, public/rules/trial-policy-sources.json:11 |
| www.britbox.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:698, rules/policy-sources.json:577, rules/return-policy-semantic-state.json:656 |
| www.calm.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:14, rules/cancel-policy-sources.json:75, rules/policy-sources.json:75 |
| www.canva.com | 22 | 13 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:15, public/rules/policy-sources.json:46, public/rules/return-policy-sources.json:15 |
| www.coursera.org | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:18, rules/trial-policy-semantic-state.json:101, rules/trial-policy-sources.json:103 |
| www.coursera.support | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:18, public/rules/policy-sources.json:58, public/rules/return-policy-sources.json:18 |
| www.crunchyroll.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:19, rules/trial-policy-semantic-state.json:95, rules/trial-policy-sources.json:107 |
| www.dashlane.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:446, rules/return-policy-sources.json:446, rules/trial-policy-semantic-state.json:444 |
| www.deezer.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:20, public/rules/policy-sources.json:66, public/rules/return-policy-sources.json:20 |
| www.discoveryplus.com | 8 | 7 | config_or_data | T3-content-static | third_party | rules/cancel-policy-sources.json:555, rules/cancel-policy-sources.json:556, rules/policy-semantic-state.json:676 |
| www.disneyplus.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:21, rules/cancel-policy-sources.json:151, rules/policy-sources.json:151 |
| www.doordash.com | 3 | 2 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:22, rules/trial-policy-sources.json:134, rules/trial-policy-sources.json:135 |
| www.dropbox.com | 17 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:78, public/rules/return-policy-sources.json:23, public/rules/trial-policy-sources.json:23 |
| www.duolingo.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:82, public/rules/return-policy-sources.json:24, public/rules/trial-policy-sources.json:24 |
| www.ea.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:573, rules/policy-sources.json:486, rules/return-policy-semantic-state.json:553 |
| www.espn.com | 24 | 16 | config_or_data | T3-content-static | third_party | rules/cancel-policy-change-candidates.json:68, rules/cancel-policy-change-candidates.json:75, rules/cancel-policy-coverage-state.json:314 |
| www.expressvpn.com | 20 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:26, public/rules/policy-sources.json:90, public/rules/return-policy-sources.json:26 |
| www.figma.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:27, public/rules/policy-sources.json:94, public/rules/return-policy-sources.json:27 |
| www.fitbit.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:535, rules/policy-sources.json:458, rules/return-policy-semantic-state.json:516 |
| www.fubo.tv | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:28, rules/cancel-policy-sources.json:178, rules/policy-sources.json:178 |
| www.grammarly.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:31, rules/cancel-policy-sources.json:204, rules/policy-sources.json:204 |
| www.headspace.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:32, rules/cancel-policy-sources.json:212, rules/policy-sources.json:212 |
| www.hellofresh.com | 14 | 8 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:33, public/rules/trial-policy-sources.json:33, rules/cancel-policy-semantic-state.json:207 |
| www.help.tinder.com | 17 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:61, public/rules/policy-sources.json:230, public/rules/return-policy-sources.json:61 |
| www.hulu.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:126, public/rules/return-policy-sources.json:35, public/rules/trial-policy-sources.json:35 |
| www.instacart.com | 20 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:37, public/rules/policy-sources.json:134, public/rules/return-policy-sources.json:37 |
| www.keepersecurity.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:544, rules/policy-sources.json:454, rules/return-policy-semantic-state.json:525 |
| www.lastpass.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:519, rules/policy-sources.json:450, rules/return-policy-semantic-state.json:500 |
| www.linkedin.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:38, public/rules/policy-sources.json:138, public/rules/return-policy-sources.json:38 |
| www.masterclass.com | 20 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:39, public/rules/policy-sources.json:142, public/rules/return-policy-sources.json:39 |
| www.max.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:40, rules/trial-policy-semantic-state.json:250, rules/trial-policy-sources.json:277 |
| www.microsoft.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:41, rules/cancel-policy-sources.json:276, rules/policy-sources.json:276 |
| www.midjourney.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:42, rules/cancel-policy-sources.json:285, rules/policy-sources.json:285 |
| www.mlb.com | 14 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:523, rules/cancel-policy-sources.json:502, rules/cancel-policy-sources.json:505 |
| www.myfitnesspal.com | 10 | 8 | config_or_data | T3-content-static | third_party | rules/policy-change-candidates.json:69, rules/policy-change-candidates.json:76, rules/policy-coverage-state.json:1096 |
| www.netflix.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:43, rules/trial-policy-semantic-state.json:270, rules/trial-policy-sources.json:297 |
| www.nfl.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:612, rules/policy-sources.json:494, rules/return-policy-semantic-state.json:573 |
| www.nintendo.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:162, public/rules/return-policy-sources.json:44, public/rules/trial-policy-sources.json:44 |
| www.noom.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:45, public/rules/policy-sources.json:166, public/rules/return-policy-sources.json:45 |
| www.notion.com | 4 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:289, rules/cancel-policy-sources.json:309, rules/cancel-policy-sources.json:312 |
| www.notion.so | 10 | 10 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:47, public/rules/policy-sources.json:174, public/rules/return-policy-sources.json:47 |
| www.nytimes.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:620, rules/policy-sources.json:506, rules/return-policy-semantic-state.json:591 |
| www.onepeloton.com | 13 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:186, public/rules/return-policy-sources.json:50, public/rules/trial-policy-sources.json:50 |
| www.openpolicyagent.org | 6 | 3 | docs_content | T3-content-static | third_party | docs/academic/decide-thesis-docx-source.txt:395, docs/academic/decide-thesis-docx-source.txt:423, docs/academic/decide-thesis-journal-manuscript.md:392 |
| www.paramountplus.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:48, rules/trial-policy-semantic-state.json:296, rules/trial-policy-sources.json:321 |
| www.patreon.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:567, rules/policy-sources.json:478, rules/return-policy-semantic-state.json:547 |
| www.peacocktv.com | 23 | 14 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:49, public/rules/policy-sources.json:182, public/rules/return-policy-sources.json:49 |
| www.playstation.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:51, public/rules/policy-sources.json:190, public/rules/return-policy-sources.json:51 |
| www.reddit.com | 6 | 6 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:659, rules/policy-sources.json:543, rules/return-policy-semantic-state.json:627 |
| www.redditinc.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:547, rules/return-policy-sources.json:547 |
| www.rfc-editor.org | 6 | 3 | docs_content | T3-content-static | third_party | docs/academic/decide-thesis-docx-source.txt:383, docs/academic/decide-thesis-docx-source.txt:430, docs/academic/decide-thesis-journal-manuscript.md:380 |
| www.roblox.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/trial-policy-semantic-state.json:500, rules/trial-policy-sources.json:485 |
| www.scribd.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:52, rules/trial-policy-semantic-state.json:332, rules/trial-policy-sources.json:357 |
| www.shutterstock.com | 20 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:53, public/rules/policy-sources.json:198, public/rules/return-policy-sources.json:53 |
| www.siriusxm.com | 14 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:482, rules/cancel-policy-sources.json:474, rules/cancel-policy-sources.json:477 |
| www.sling.com | 13 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:55, public/rules/policy-sources.json:206, public/rules/return-policy-sources.json:55 |
| www.snap.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/policy-semantic-state.json:640, rules/policy-sources.json:535, rules/return-policy-semantic-state.json:618 |
| www.snapchat.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/trial-policy-semantic-state.json:565, rules/trial-policy-sources.json:526 |
| www.spotify.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:210, public/rules/return-policy-sources.json:56, public/rules/trial-policy-sources.json:56 |
| www.squarespace.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:57, rules/trial-policy-semantic-state.json:372, rules/trial-policy-sources.json:385 |
| www.starz.com | 15 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:586, rules/cancel-policy-sources.json:560, rules/cancel-policy-sources.json:564 |
| www.strava.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:218, public/rules/return-policy-sources.json:58, public/rules/trial-policy-sources.json:58 |
| www.todoist.com | 9 | 9 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:62, public/rules/policy-sources.json:234, public/rules/return-policy-sources.json:62 |
| www.twitch.tv | 12 | 11 | config_or_data, data_source | T3-content-static | third_party | public/rules/policy-sources.json:238, public/rules/return-policy-sources.json:63, public/rules/trial-policy-sources.json:63 |
| www.uber.com | 16 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:419, rules/cancel-policy-sources.json:418, rules/cancel-policy-sources.json:421 |
| www.ubisoft.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:503, rules/cancel-policy-sources.json:494 |
| www.w3.org | 12 | 3 | docs_content | T3-content-static | third_party | docs/academic/decide-thesis-docx-source.txt:403, docs/academic/decide-thesis-docx-source.txt:405, docs/academic/decide-thesis-docx-source.txt:421 |
| www.walmart.com | 12 | 12 | config_or_data, data_source | T3-content-static | third_party | public/rules/cancel-policy-sources.json:64, public/rules/policy-sources.json:242, public/rules/return-policy-sources.json:64 |
| www.washingtonpost.com | 4 | 4 | config_or_data | T3-content-static | third_party | rules/policy-sources.json:522, rules/return-policy-sources.json:522, rules/trial-policy-semantic-state.json:553 |
| www.weightwatchers.com | 8 | 8 | config_or_data | T3-content-static | third_party | rules/cancel-policy-semantic-state.json:491, rules/cancel-policy-sources.json:470, rules/policy-semantic-state.json:561 |
| www.wix.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:65, rules/trial-policy-semantic-state.json:424, rules/trial-policy-sources.json:433 |
| www.wsj.com | 2 | 2 | config_or_data | T3-content-static | third_party | rules/trial-policy-semantic-state.json:536, rules/trial-policy-sources.json:509 |
| www.xbox.com | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:66, rules/trial-policy-semantic-state.json:416, rules/trial-policy-sources.json:437 |
| www.youtube.com | 7 | 6 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:67, rules/cancel-policy-sources.json:445, rules/policy-sources.json:437 |
| x.com | 4 | 3 | config_or_data, docs_content | T3-content-static | third_party | README.md:394, README.md:403, rules/trial-policy-semantic-state.json:559 |
| zoom.us | 3 | 3 | config_or_data, data_source | T3-content-static | third_party | public/rules/trial-policy-sources.json:68, rules/trial-policy-semantic-state.json:617, rules/trial-policy-sources.json:572 |

## 4) Generation Method

```bash
./scripts/generate-project-inventory.sh
```

- URLs are host-normalized (`URL.hostname`) with cleanup for comma-separated URL strings.
- Risk tiers are rule-based and prioritized from runtime-critical to content/static.
- Parse failures are listed in `OUTBOUND_URL_PARSE_ISSUES.md`.
