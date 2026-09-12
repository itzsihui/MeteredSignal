# Demo + submission checklist (ETHOnline 2026)

**Deadline:** Sunday Sep 13, 2026 · 12:00pm EDT  
**Partners:** The Graph · Hedera · Arc  
**Project:** MeteredSignal

## Tracks to name explicitly in the form

1. Hedera — AI & Agentic Payments on Hedera  
2. The Graph — Best AI (From Scratch)  
3. The Graph — Best Use of Composable / Standardized Graph Products  
4. Arc — Best Agentic Economy Application with Circle Agent Stack  
5. Arc — Launch on Arc Testnet (mainnet unlock by Sep 30)

## Pre-flight (must be green)

```bash
npm run dev
# UI: http://localhost:5173 (or agent-served dist on :3001)
curl -s http://localhost:4021/v1/catalog | jq .registry
curl -si http://localhost:4021/v1/testnet/hbar/lending-compare | head -20   # expect 402
curl -s -X POST http://localhost:3001/api/run -H 'content-type: application/json' \
  -d '{"mode":"lending-compare"}' | jq '{stages,verdict:.decision.verdict,arc:.arc.status,audit:.signal.hederaAudit,arcTx:.explorers.arcTx,topic:.explorers.hederaTopic}'
```

Expect: stages include `accepted` → `complete`, `verdict` GO/NO_GO, `arc` executed, `audit` like `0.0.…@SUCCESS`.

**Local demo UI:** http://localhost:3001  
**Public tunnel (cloudflared → localhost:3001):** https://traditions-faced-honors-popularity.trycloudflare.com  
Re-check before submit (`curl -s …/api/health`). Quick tunnels die/rotate — restart with `npx cloudflared tunnel --url http://localhost:3001` if needed. Prefer cloudflared over Vercel for this hack: merchant+agent need Hedera/Arc keys, SSE, and localhost `MERCHANT_URL` coupling.  
**HCS topic:** https://hashscan.io/testnet/topic/0.0.10505288

## Video script (≤5 min)

1. **0:00** One-liner + sponsors on screen (Graph / Hedera Blocky402 / Arc USDC).  
2. **0:20** Catalog — Messari standardized registry (≥2 protocols, one query template).  
3. **0:45** Run lending-compare — show live pipeline: 402 → settle → Graph → freshness → **GO** + protocol ranking (TVL / utilization). Say out loud: agent *reasons* on Graph data, does not dump JSON.  
4. **1:45** Open HashScan payer + HCS topic message (audit extra points).  
5. **2:15** ArcScan Circle nanopayment / Gateway receipt + say spend policy: GO-only + max spend (Agent Stack).  
6. **2:40** **Freshness fail beat:** toggle **Simulate indexer lag** → re-run. Show protocols `stale` (`block lag N > max`), verdict **UNAVAILABLE**, Arc **skipped / refuse spend**. (Still paid live Graph query; tip lag exercises the real `_meta` gate.)  
7. **3:05** **NO_GO refuse-spend beat:** Wallet risk → preset **NO_GO · high borrow** → Pay x402 + run. Show live Messari exposure, verdict **NO_GO**, Arc badge **refused spend** (no ArcScan tx).  
8. **3:35** Architecture diagram in README — each sponsor load-bearing.  
9. **3:55** End with bounty names + public GitHub URL.

### Freshness fail — what to say on camera

> “Same paid Messari query. We inject tip ahead of `_meta.block`. Lag exceeds the gate → sources marked stale → agent verdict UNAVAILABLE → Arc policy refuses USDC. Graph isn’t a dump; freshness is load-bearing.”

### NO_GO refuse spend — what to say on camera

> “Different wallet, same rails. Messari standardized positions show large borrow notional and high borrow/deposit. Verdict NO_GO. Agent Stack policy is GO-only — Arc USDC does not move.”

### Curl for the same beats (no UI)

```bash
# Normal GO path
curl -s -X POST http://localhost:3001/api/run -H 'content-type: application/json' \
  -d '{"mode":"lending-compare"}' | jq '{verdict:.decision.verdict,reasons:.decision.rationale,arc:.arc.status,ranking:.signal.decision.recommendation.ranking[:2]}'

# Forced lag → UNAVAILABLE → Arc refuse
curl -s -X POST http://localhost:3001/api/run -H 'content-type: application/json' \
  -d '{"mode":"lending-compare","forceStale":true}' | jq '{verdict:.decision.verdict,reasons:.decision.rationale,arc:.arc.status,demo:.signal.freshnessDemo,protocols:[.signal.protocols[]|{slug,status,reason}]}'

# Live high-borrow wallet → NO_GO → Arc refuse (no USDC tx)
curl -s -X POST http://localhost:3001/api/run -H 'content-type: application/json' \
  -d '{"mode":"wallet-risk","address":"0x6142eb927529974c5cded66dafc57cb5aaaf73ab"}' \
  | jq '{verdict:.decision.verdict,rationale:.decision.rationale,risk:.signal.decision.riskScore,arc:.arc.status,arcReason:.arc.reason,tx:.explorers.arcTx}'
```

Expect NO_GO curl: `verdict: "NO_GO"`, `arc: "skipped"`, `arcReason` mentions refuse, `tx: null`.
## Submission form tips

- Paste the one-pager from [SUBMISSION.md](./SUBMISSION.md) into the project description  
- Public repo + demo video required  
- Fill partner feedback fields honestly  
- Link HashScan topic + ArcScan tx in description  
- After submit: follow [ARC_MAINNET.md](./ARC_MAINNET.md) for Sep 30 unlock ($2.5k portion)
