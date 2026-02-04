# decide.fyi Demo Script (60-90 seconds)

Goal: show deterministic notaries + playground + audit trail in one clean flow.

## Setup
- Open `https://decide.fyi/#agents`
- Have the browser zoom at 100%.

## Script (voice + click path)

1) "This is decide: decision infrastructure for agents. Four deterministic MCP notaries: refund, cancel, return, trial."
   - Scroll just enough to show the notary cards.

2) "Instead of guessing policy answers, your agent calls a notary and gets the same verdict every time — with receipts."
   - Click **Playground** in the top nav.

3) "Here’s the live playground. I’ll run a real MCP call."
   - Click **Demo: refund ALLOWED** (or select Refund Notary + MCP + preset and click **Load preset**).
   - Click **Run request**.

4) "You get a deterministic verdict and an audit trail entry with the exact inputs and rules version."
   - Point to **Latest response**.
   - Scroll a bit to show **Audit trail** row.

5) "If something changes, we can diff responses and export runs for QA or customer support."
   - Click **Export CSV** in Advanced tools (optional).

Close:
- "If you're building an agent that touches subscription support, this is a drop-in reliability layer."

## Optional 10-second add-on
- Switch Notary to **Cancel** and hit **Demo: cancel PENALTY**.
