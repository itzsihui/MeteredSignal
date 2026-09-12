# MeteredSignal — ETHOnline 2026 submission writeup

**One sentence:** An Arc agent buys live multi-protocol DeFi lending intelligence (Messari Standardized Subgraphs) via **x402**, settles on **Hedera (Blocky402)**, then spends **USDC on Arc via Circle Agent Stack nanopayments** only on a GO verdict.

**Partners / bounties claimed**
1. Hedera — AI & Agentic Payments on Hedera  
2. The Graph — Best AI Use Case (From Scratch)  
3. The Graph — Best Use of Composable / Standardized Graph Products  
4. Arc — Best Agentic Economy Application with Circle Agent Stack  
5. Arc — Launch on Arc Testnet (mainnet unlock path by Sep 30)

---

## Problem

Agents that act on DeFi need fresh, cross-protocol lending signal — not a single subgraph dump, not a monthly API key, and not blind USDC spend. Today those pieces are siloed: Graph data is free-to-query but hard for agents to budget; x402 payment rails exist on Hedera but lack real metered data services; Arc Agent Stack wallets can hold USDC but need decision logic tied to live signals. MeteredSignal closes that loop: pay-per-call intelligence → freshness-gated verdict → conditional Circle nanopayment on Arc.

---

## Architecture

```
User goal (NL) → Arc-side agent wallet (Circle GatewayClient)
        │
        ├─ GET paywalled merchant  ──HTTP 402──► sign + settle (Blocky402 / Hedera testnet)
        │                                              │
        │                                              ▼
        │                                    Merchant (:4021)
        │                                    · Messari standardized GraphQL (Aave / Compound / Spark)
        │                                    · _meta freshness gate (reject stale)
        │                                    · metered HBAR prices (compare ≠ risk)
        │                                    · HCS settlement audit topic
        │                                    · Arc GO seller: Gateway-batched x402 (/v1/arc/usdc/go-action)
        │                                              │
        ◄────────────── paid JSON signal ──────────────┘
        │
        ▼
  Verdict: GO / NO_GO / UNAVAILABLE  (+ protocol ranking on lending-compare)
        │
        └─ GO only → Circle nanopayment (Gateway deposit/pay, spend cap)
                     optional native USDC fallback if Gateway fails
```

**Flow in one pass:** discover catalog → Hedera 402 settle → live Graph query → `_meta` freshness → agent reasoning → Arc Circle nanopayment (or refuse).

---

## How each sponsor is load-bearing

### The Graph — signal layer (not optional)

- **Live Studio / gateway data** — no mocks; Messari Standardized Lending subgraphs.
- **Composable / standardized** — one query template across **Aave v3, Compound v3, Spark** (registry in `packages/graph`); same schema → N protocols.
- **AI use (From Scratch)** — agent reasons to GO / NO_GO / UNAVAILABLE; ranks venues by TVL / utilization; refuses autonomous spend if fewer than 2 fresh sources; never dumps raw JSON as the product.
- **Freshness** — requires `_meta.block.number` / timestamp; pin deployments; return `unavailable` when lag exceeds `GRAPH_MAX_BLOCK_LAG` (demo tip-lag via `forceStale` for the video beat).

Without The Graph, there is no evidence and no verdict.

### Hedera — payment + audit rail

- **Live x402-gated merchant** on Hedera testnet settled through **Blocky402** (`https://api.testnet.blocky402.com`).
- **Metered pricing** — lending-compare ≈ 0.001 HBAR; wallet-risk ≈ 0.0025 HBAR (not a flat subscription).
- **Consumer path** — agent discovers the endpoint, pays without an API key, completes ≥1 real paid request end-to-end.
- **Extra points** — each settlement appends to an **HCS topic** for a verifiable payment audit trail.

Without Hedera / Blocky402, the merchant is not a payable agent service.

### Arc — economic actor (Circle Agent Stack)

- On Graph **GO**, the agent settles a **Circle nanopayment** with `@circle-fin/x402-batching` (`GatewayClient` buyer → merchant `createGatewayMiddleware` seller on `/v1/arc/usdc/go-action`).
- **Gasless settlement path for the agent** — Gateway-batched x402 on Arc Testnet (`eip155:5042002`); spend capped by `ARC_SPEND_AMOUNT_USDC` (abort if requirement exceeds cap).
- **Decision logic tied to real signals** — NO_GO / UNAVAILABLE → spend refused; GO → nanopay (native USDC transfer only as fallback if `ARC_NANOPAY_FALLBACK=true`).
- **Launch track** — testnet path shipped now; mainnet = env swap before **Sep 30** unlock — see [ARC_MAINNET.md](./ARC_MAINNET.md).

Without Arc + Circle nanopayments, the agent never closes the loop from intelligence to capital under Agent Stack rails.

---

## Links

| What | URL |
|------|-----|
| Public repo | https://github.com/itzsihui/xagent |
| Demo UI (local) | http://localhost:3001 |
| Public tunnel (cloudflared → :3001) | https://traditions-faced-honors-popularity.trycloudflare.com |
| Merchant catalog | http://localhost:4021/v1/catalog |
| Blocky402 facilitator | https://api.testnet.blocky402.com/supported |
| HCS audit topic | https://hashscan.io/testnet/topic/0.0.10505288 |
| Demo script | [DEMO.md](./DEMO.md) |
| Architecture + setup | [README.md](./README.md) |

**Live demo hosting:** We expose the local agent UI + APIs with a **Cloudflare quick tunnel** (`cloudflared tunnel --url http://localhost:3001`). Restart the tunnel before final submit and paste the fresh `*.trycloudflare.com` URL here / in the ETHGlobal form (quick tunnels rotate and die).

**Video:** ≤5 min — Arc budget → Hedera 402 settle → multi-protocol Graph + freshness / ranking → GO → Circle nanopayment on ArcScan + HashScan / HCS (see DEMO.md). Include the freshness-fail beat (simulate indexer lag → UNAVAILABLE → refuse spend).

**Mainnet note (Arc):** [ARC_MAINNET.md](./ARC_MAINNET.md) — same decision → Circle nanopayment flow; flip Arc env when mainnet RPC/chain ID publish (unlock by Sep 30).
