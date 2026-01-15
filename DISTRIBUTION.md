# Distribution Strategy - Agent-First

Next 1-2 high-signal places to submit the refund notary.

---

## ✅ Already Submitted

- **awesome-mcp-servers** - PR #1678 submitted, awaiting merge
- **Official MCP Registry** - Published v1.0.0 on 16/01/2026

---

## 🎯 Next Target: smithery.ai (MCP Server Directory)

**URL:** https://smithery.ai/submit

**Why:** Dedicated MCP server directory with web UI for discovery. Users browse here to find servers.

**How to Submit:**

1. Go to https://smithery.ai/submit
2. Fill out form:
   - **Server Name:** refund.decide.fyi
   - **Description:** Deterministic refund eligibility notary for US consumer subscriptions. Returns ALLOWED, DENIED, or UNKNOWN based on vendor refund policies.
   - **GitHub URL:** https://github.com/ndkasndakn/decade
   - **MCP Endpoint:** https://refund.decide.fyi/api/mcp
   - **Categories:** Developer Tools, Finance, Utilities
   - **Tags:** refund, subscription, notary, mcp, deterministic

3. Submit and wait for approval

**Expected Impact:** Moderate. Not as high-signal as official MCP org, but good for human discovery.

---

## ❌ Skip These (For Now)

**Don't submit to:**
- Product Hunt (too early, need traction first)
- Hacker News Show HN (save for when you have 5+ external calls)
- Reddit r/ClaudeAI (low signal, high noise)
- Twitter/X threads (wait until you have usage proof)

---

## 📊 Priority

**Do these in order:**

1. **modelcontextprotocol/servers** (highest signal)
2. **smithery.ai** (good discovery)
3. **Stop. Wait 7-10 days. Check logs.**

Do not spam more registries. Quality over quantity.

---

## 🔍 How to Track Success

After submission, watch your Vercel logs for:

```bash
# Look for POST requests from non-curl user agents
grep "POST /api/v1/refund/eligibility" vercel-logs.json | grep -v "curl"

# Look for MCP calls
grep "POST /api/mcp" vercel-logs.json
```

If you see 1-2 external calls within 7 days, you're on the right track.

---

## ⏰ Timing

- Submit to MCP registry today
- Submit to smithery.ai tomorrow
- Then stop distributing for 7-10 days
- Focus on watching logs instead of marketing
