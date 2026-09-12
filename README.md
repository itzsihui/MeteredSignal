# MeteredSignal

**ETHOnline 2026** — x402-metered onchain intelligence for agents.

Agents **pay per request** (Hedera x402 via Blocky402) for live multi-protocol lending data from **Messari Standardized Subgraphs** on The Graph, then decide whether to spend **USDC on Arc**.

## Partners / tracks

| Partner | Tracks claimed |
|---------|----------------|
| **The Graph** | Best AI Use Case (From Scratch); Composable / Standardized Graph Products |
| **Hedera** | AI & Agentic Payments on Hedera (Blocky402 x402 service) |
| **Arc** | Best Agentic Economy; Launch on Arc Testnet → Mainnet |

## Architecture

```
Browser UI (:3001)
    │  POST /api/run
    ▼
Agent (Hedera x402 payer + Arc USDC actor)
    │  GET paywalled merchant URL (402 → sign → settle)
    ▼
Merchant (:4021)  — paymentMiddleware + Blocky402
    │  live GraphQL
    ▼
The Graph gateway — Messari standardized lending subgraphs
    │  freshness (_meta) gates
    ▼
JSON signal → agent verdict GO / NO_GO / UNAVAILABLE
    │
    ▼
Optional Arc Testnet USDC transfer on GO
```

## Quick start

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Credentials

1. **Hedera testnet** — two ECDSA accounts at [portal.hedera.com](https://portal.hedera.com): service (receiver) + agent (payer). Fund HBAR via faucet.
2. **The Graph** — API key from [Subgraph Studio](https://thegraph.com/studio/).
3. **Arc (optional for full prize path)** — fund native USDC on Arc Testnet via [faucet.circle.com](https://faucet.circle.com); set agent key + treasury.

Set in `.env`:

- `HEDERA_SERVICE_ACCOUNT_ID` / `HEDERA_SERVICE_PRIVATE_KEY`
- `HEDERA_AGENT_ACCOUNT_ID` / `HEDERA_AGENT_PRIVATE_KEY`
- `GRAPH_API_KEY`
- `X402_TESTNET_FACILITATOR_URL=https://api.testnet.blocky402.com`
- `ARC_RPC_URL=https://rpc.testnet.arc.io`, `ARC_AGENT_PRIVATE_KEY`, `ARC_TREASURY_ADDRESS`

### 3. Run

```bash
npm run dev
```

- Merchant: http://localhost:4021/v1/catalog  
- Agent API: http://localhost:3001  
- **Web UI (shadcn + Aceternity + React Bits):** http://localhost:5173  

Fill `.env` before `npm run dev` — merchant exits if Hedera service account or Graph API key is missing.

### Smoke tests

```bash
# Free catalog
curl -s http://localhost:4021/v1/catalog | jq .

# Expect HTTP 402 with payment requirements
curl -si 'http://localhost:4021/v1/testnet/hbar/lending-compare' | head -40

# Blocky402 supports Hedera testnet
curl -s https://api.testnet.blocky402.com/supported | jq .
```

## Why this wins for judges

- **Graph:** one Messari query template across Aave v3 / Compound v3 / Spark; rejects stale `_meta`.
- **Hedera:** live x402-gated service settled through **Blocky402**; metered HBAR prices; **HCS payment audit trail**.
- **Arc:** agent only spends USDC after a GO verdict, with an explicit spend-cap policy.

## Demo + submit

See [DEMO.md](./DEMO.md) for the video script, qualification curls, and bounty names to paste into the ETHGlobal form.

## Repo layout

```
packages/
  graph/      Messari registry + freshness-gated queries
  merchant/   Express + @x402/express + Blocky402 + HCS audit
  agent/      x402 payer client, Arc USDC actor, API
  web/        Demo UI (SSE pipeline + receipts)
scripts/      HTS associate + create HCS topic
```

## Mainnet readiness (Arc Launch track)

Deploy merchant + agent against Arc mainnet RPC / USDC when Arc mainnet is live (target before **Sept 30** for the mainnet unlock portion of Arc prizes). Keep the same decision → spend flow; swap env URLs and addresses only.

Create HCS topic (once):

```bash
npm run create-topic
```
