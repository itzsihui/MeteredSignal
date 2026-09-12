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
**Public tunnel (while cloudflared is running):** https://traditions-faced-honors-popularity.trycloudflare.com  
**HCS topic:** https://hashscan.io/testnet/topic/0.0.10505288

## Video script (≤5 min)

1. **0:00** One-liner + sponsors on screen (Graph / Hedera Blocky402 / Arc USDC).  
2. **0:20** Catalog — Messari standardized registry (≥2 protocols, one query template).  
3. **0:45** Run lending-compare — show live pipeline: 402 → settle → Graph → freshness → GO.  
4. **1:45** Open HashScan payer + HCS topic message (audit extra points).  
5. **2:15** ArcScan USDC receipt + say spend policy: GO-only + max spend.  
6. **2:45** Optional: wallet-risk NO_GO / refuse spend.  
7. **3:15** Architecture diagram in README — each sponsor load-bearing.  
8. **3:45** End with bounty names + public GitHub URL.

## Submission form tips

- Public repo + demo video required  
- Fill partner feedback fields honestly  
- Link HashScan topic + ArcScan tx in description  
- After submit: keep Arc mainnet-ready for Sep 30 unlock ($2.5k portion)
