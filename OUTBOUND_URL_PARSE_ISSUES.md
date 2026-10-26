# Outbound URL Parse Issues

Generated: 2026-10-26T12:19:41.385Z

- Raw URL-matched lines scanned: **3190**
- Parse/normalization issues: **16**

## Reason Summary

- url_parse_error: 11
- invalid_host: 5

## Issue List

| File | Line | Reason | URL fragment |
| --- | ---: | --- | --- |
| README.md | 639 | url_parse_error | https://decide.fyi](https://decide.fyi |
| README.md | 641 | url_parse_error | https://refund.decide.fyi](https://refund.decide.fyi |
| README.md | 642 | url_parse_error | https://cancel.decide.fyi](https://cancel.decide.fyi |
| README.md | 643 | url_parse_error | https://return.decide.fyi](https://return.decide.fyi |
| README.md | 644 | url_parse_error | https://trial.decide.fyi](https://trial.decide.fyi |
| README.md | 646 | url_parse_error | https://modelcontextprotocol.io](https://modelcontextprotocol.io |
| scripts/mcp-check-local.sh | 48 | url_parse_error | http://127.0.0.1:$ |
| scripts/request-query-regression.test.js | 35 | url_parse_error | http://[ |
| scripts/test-check-policies.js | 384 | url_parse_error | http://127.0.0.1:$ |
| scripts/test-check-policies.js | 463 | url_parse_error | http://127.0.0.1:$ |
| scripts/test-origin-guard.js | 75 | invalid_host | https://$ |
| scripts/test-origin-guard.js | 89 | invalid_host | https://$ |
| scripts/test-origin-guard.js | 100 | invalid_host | https://$ |
| scripts/test-origin-guard.js | 123 | invalid_host | https://$ |
| scripts/test-policy-mcp-http.js | 13 | invalid_host | http://localhost').pathname |
| scripts/test-policy-mcp-http.js | 20 | url_parse_error | http://127.0.0.1:$ |

