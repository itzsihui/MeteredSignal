# Arc mainnet readiness — Sep 30 $2.5k unlock

**Deadline:** September 30, 2026  
**Prize slice:** $2,500 of Arc **Best Agentic Economy** / **Launch** totals is paid only if the **same project** is deployed to **Arc Mainnet** by that date.

MeteredSignal already runs the full agent path on **Arc Testnet**. This doc is the flip playbook so we can claim the unlock without rewriting the product.

Official Arc status (as of docs.arc.io): **Public Testnet** is live (`5042002`). **Private / Public Mainnet** are still *Upcoming* — mainnet RPC, chain ID, and explorer are **not published yet**. Watch [RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints) and [Deployment model](https://docs.arc.io/arc/concepts/deployment-model).

---

## What “deployed to Arc Mainnet” means for us

We do not ship custom Solidity. The Arc surface is:

1. Agent wallet funds **Circle Gateway** with Arc ERC-20 USDC (gas remains native USDC).
2. Graph + Hedera x402 produce a **GO / NO_GO / UNAVAILABLE** verdict.
3. On **GO only**, agent settles a **Circle Agent Stack nanopayment** (`GatewayClient` → merchant Gateway seller in `packages/agent/src/arc.ts` / `packages/merchant/src/arc-gateway.ts`). Native USDC transfer is fallback only (`ARC_NANOPAY_FALLBACK`).

**Mainnet deploy = that same decision → Circle nanopayment flow, pointed at Arc Mainnet, with a public ArcScan (or successor) tx receipt.** Hedera merchant + Graph stay as-is; only Arc env flips.

---

## Testnet baseline (already shipping)

| Knob | Current value |
|------|----------------|
| RPC | `https://rpc.testnet.arc.io` |
| Chain ID | `5042002` |
| Explorer | `https://testnet.arcscan.app` |
| Spend path | Circle nanopayments (`@circle-fin/x402-batching` Gateway); native USDC fallback optional |
| Fund wallet | [faucet.circle.com](https://faucet.circle.com) → Arc Testnet (ERC-20 USDC for Gateway + native for gas) |
| Policy | `requireGoVerdict` + `ARC_SPEND_AMOUNT_USDC` + Gateway spend-cap abort |

Smoke (testnet):

```bash
curl -s -X POST http://localhost:3001/api/run -H 'content-type: application/json' \
  -d '{"mode":"lending-compare"}' \
  | jq '{verdict:.decision.verdict, arc:.arc}'
```

Expect `arc.status` = `executed` and `explorerUrl` on testnet ArcScan when credentials are set.

---

## Env flip (when Circle publishes mainnet params)

Keep the **same** keys. Fill placeholders from Arc docs the day they appear:

```bash
# --- Arc Mainnet (Sep 30 unlock) ---
ARC_IS_MAINNET=true
ARC_NETWORK_NAME=Arc          # or whatever Circle publishes
ARC_RPC_URL=                  # e.g. https://rpc.arc.io — TBD from docs
ARC_CHAIN_ID=                 # TBD — do NOT reuse 5042002
ARC_EXPLORER_URL=             # e.g. https://arcscan.app — TBD
ARC_AGENT_PRIVATE_KEY=        # dedicated mainnet key (not the faucet testnet key)
ARC_TREASURY_ADDRESS=         # your mainnet treasury
ARC_SPEND_AMOUNT_USDC=0.01    # keep tiny with real USDC
```

Code path is already env-driven (`arcChain` in `packages/agent/src/arc.ts`). No feature branch required for the spend actor.

### Checklist when params drop

- [ ] Copy published **RPC**, **chain ID**, **explorer** from [docs.arc.io](https://docs.arc.io/arc/references/rpc-endpoints) into `.env`
- [ ] Set `ARC_IS_MAINNET=true` and `ARC_NETWORK_NAME`
- [ ] Create a **new** agent keypair; fund with **real** USDC on Arc (gas + spend)
- [ ] Confirm treasury address on mainnet
- [ ] Keep `ARC_SPEND_AMOUNT_USDC` small (real money)
- [ ] Restart `npm run dev` (or production process)
- [ ] Run lending-compare → expect `verdict: GO` → `arc.status: executed`
- [ ] Save mainnet tx URL (`arc.explorerUrl`) for ETHGlobal / Arc follow-up
- [ ] Optionally paste tx + this doc link into project showcase / Discord as “mainnet unlock evidence”

---

## Safety (real USDC)

| Rule | Why |
|------|-----|
| Separate mainnet private key | Never reuse faucet/testnet keys with real funds |
| Tiny spend cap | Policy is the only size limit; set it consciously |
| GO-only still enforced | NO_GO / UNAVAILABLE never spend |
| Dry-run if creds missing | Missing key/treasury → `dry_run`, not a panic spend |
| Native transfer only | We use `value` in USDC wei (18 dec via `parseEther`); do not mix ERC-20 6-dec amounts |

---

## Evidence pack for judges / unlock

After a successful mainnet run, keep:

1. **Mainnet tx URL** from `arc.explorerUrl`
2. Agent response JSON snippet (`verdict` + `arc`)
3. Confirmation that Graph + Hedera paths were unchanged (same repo / same decision logic)
4. Link to this file in the repo README

---

## Watch list (until mainnet is live)

| Source | Watch for |
|--------|-----------|
| [Deployment model](https://docs.arc.io/arc/concepts/deployment-model) | Private/Public Mainnet status → Live |
| [RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints) | Mainnet HTTP/WSS + chain ID note |
| [Contract addresses](https://docs.arc.io/arc/references/contract-addresses) | Mainnet USDC / App Kit addresses (only if we add App Kit later) |
| [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc) | Wallet / explorer URLs |
| ETHGlobal / Arc mentor channels | Formal “how to prove mainnet deploy” instructions |

---

## Out of scope for the unlock

- Redeploying the Hedera merchant or Graph subgraphs
- Changing GO / spend-cap policy semantics
- Waiting on App Kits / Nanopayments mainnet params — testnet already uses Circle Gateway nanopayments; flip env when mainnet Gateway/network IDs publish
