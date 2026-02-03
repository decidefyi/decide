# Distribution Strategy - Agent-First

Next 1-2 high-signal places to submit the refund notary.

---

## ✅ Already Submitted

- **awesome-mcp-servers** - PR #1678 submitted, awaiting merge
- **Official MCP Registry** - Published v1.2.0 on 16/01/2026
- **Smithery.ai** - Published on 16/01/2026 at https://smithery.ai/server/refund-decide/notary

---

## ❌ Skip These (For Now)

**Don't submit to:**
- Product Hunt (too early, need traction first)
- Hacker News Show HN (save for when you have 5+ external calls)
- Reddit r/ClaudeAI (low signal, high noise)
- Twitter/X threads (wait until you have usage proof)

---

## 📊 Priority

**Current mode:**

1. **Stop. Wait 7-10 days. Check logs.**
2. If external calls appear, iterate on docs/tooling before further distribution.
3. If no calls appear, revisit one new high-signal channel.

Do not spam registries. Quality over quantity.

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

- ✅ MCP Registry - Completed 16/01/2026
- ✅ Smithery.ai - Completed 16/01/2026
- ⏸️  Now: Stop distributing for 7-10 days
- 📊 Focus on watching logs instead of marketing
