import { GatewayClient } from '@circle-fin/x402-batching/client';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type Hex,
  type Address,
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/** Arc Testnet — native gas is USDC (18 decimals). Gateway USDC is the 0x3600… token (6 decimals). */
export const arcTestnet = defineChain({
  id: Number(process.env.ARC_CHAIN_ID ?? 5042002),
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

export type ArcSpendPolicy = {
  requireGoVerdict: true;
  maxSpendUsdc: string;
  treasury: string | null;
  agentWallet: string | null;
  stack: 'circle-nanopayments' | 'native-fallback';
};

export type ArcActionResult = {
  status: 'executed' | 'skipped' | 'dry_run';
  reason: string;
  txHash?: string;
  chainId?: number;
  explorerUrl?: string;
  policy: ArcSpendPolicy;
  balanceUsdc?: string;
  gatewayBalanceUsdc?: string;
  nanopay?: {
    amount?: string;
    settlementTx?: string;
    data?: unknown;
  };
};

function normalizePk(pkRaw: string): Hex | null {
  const pk = (pkRaw.startsWith('0x') ? pkRaw : `0x${pkRaw}`) as Hex;
  return /^0x[0-9a-fA-F]{64}$/.test(pk) ? pk : null;
}

function loadPolicy(
  agentWallet: string | null,
  stack: ArcSpendPolicy['stack'],
): ArcSpendPolicy {
  return {
    requireGoVerdict: true,
    maxSpendUsdc: process.env.ARC_SPEND_AMOUNT_USDC ?? '0.01',
    treasury: process.env.ARC_TREASURY_ADDRESS?.trim() || null,
    agentWallet,
    stack,
  };
}

function goActionUrl(): string {
  const base = (process.env.MERCHANT_URL ?? 'http://localhost:4021').replace(/\/$/, '');
  const qs = new URLSearchParams({ verdict: 'GO' });
  return `${base}/v1/arc/usdc/go-action?${qs}`;
}

async function ensureGatewayBalance(
  gateway: GatewayClient,
  needUsdc: string,
): Promise<{ deposited: boolean; depositTx?: string; gatewayAvailable: string }> {
  const balances = await gateway.getBalances();
  const available = Number(balances.gateway.formattedAvailable);
  const need = Number(needUsdc);
  if (Number.isFinite(available) && available >= need) {
    return { deposited: false, gatewayAvailable: balances.gateway.formattedAvailable };
  }

  const depositAmt =
    process.env.ARC_GATEWAY_DEPOSIT_USDC?.trim() ||
    String(Math.max(need * 10, 0.1));

  const walletUsdc = await gateway.getUsdcBalance();
  if (Number(walletUsdc.formatted) < Number(depositAmt)) {
    throw new Error(
      `Insufficient Arc ERC-20 USDC to deposit into Gateway (have ${walletUsdc.formatted}, need ${depositAmt}). Fund via faucet.circle.com (Arc Testnet USDC).`,
    );
  }

  const result = await gateway.deposit(depositAmt);
  const after = await gateway.getBalances();
  return {
    deposited: true,
    depositTx: result.depositTxHash,
    gatewayAvailable: after.gateway.formattedAvailable,
  };
}

/**
 * On GO: settle a Circle Agent Stack nanopayment (Gateway-batched x402 on Arc).
 * Falls back to a native USDC transfer when ARC_NANOPAY_FALLBACK=true.
 */
export async function maybeExecuteArcUsdc(opts: {
  verdict: 'GO' | 'NO_GO' | 'UNAVAILABLE';
}): Promise<ArcActionResult> {
  const pkRaw = process.env.ARC_AGENT_PRIVATE_KEY?.trim();
  const treasury = process.env.ARC_TREASURY_ADDRESS as Address | undefined;
  const amount = process.env.ARC_SPEND_AMOUNT_USDC ?? '0.01';
  const allowFallback = process.env.ARC_NANOPAY_FALLBACK !== 'false';

  let agentWallet: string | null = null;
  const pk = pkRaw ? normalizePk(pkRaw) : null;
  if (pk) {
    try {
      agentWallet = privateKeyToAccount(pk).address;
    } catch {
      agentWallet = null;
    }
  }

  const nanoPolicy = loadPolicy(agentWallet, 'circle-nanopayments');

  if (opts.verdict !== 'GO') {
    return {
      status: 'skipped',
      reason: `Verdict ${opts.verdict} — agent refuses Arc USDC spend (policy: require GO)`,
      policy: nanoPolicy,
    };
  }

  if (!pk || !treasury) {
    return {
      status: 'dry_run',
      reason:
        'Arc credentials missing (ARC_AGENT_PRIVATE_KEY, ARC_TREASURY_ADDRESS). Would nanopay GO action via Circle Gateway.',
      chainId: arcTestnet.id,
      policy: nanoPolicy,
    };
  }

  try {
    const gateway = new GatewayClient({
      chain: 'arcTestnet',
      privateKey: pk,
    });

    const maxAtomic = BigInt(Math.round(Number(amount) * 1_000_000));
    gateway.onBeforePaymentCreation(async (ctx) => {
      const reqAmount = BigInt(ctx.selectedRequirements.amount);
      if (reqAmount > maxAtomic) {
        return {
          abort: true,
          reason: `Payment ${reqAmount} exceeds spend cap ${maxAtomic} (ARC_SPEND_AMOUNT_USDC=${amount})`,
        };
      }
    });

    const funded = await ensureGatewayBalance(gateway, amount);
    const url = goActionUrl();
    const supports = await gateway.supports(url);
    if (!supports.supported) {
      throw new Error(
        `Arc go-action endpoint does not advertise Gateway batching: ${JSON.stringify(supports)}`,
      );
    }

    const paid = await gateway.pay<{
      stack?: string;
      message?: string;
      seller?: string;
    }>(url, { method: 'GET' });

    const settlementTx = paid.transaction || undefined;
    const balances = await gateway.getBalances();

    return {
      status: 'executed',
      reason: `Circle nanopayment ${paid.formattedAmount ?? amount} USDC via Gateway after Graph GO${
        funded.deposited ? ` (deposited first: ${funded.depositTx?.slice(0, 12)}…)` : ''
      }`,
      txHash: settlementTx || funded.depositTx,
      chainId: arcTestnet.id,
      explorerUrl: settlementTx
        ? `https://testnet.arcscan.app/tx/${settlementTx}`
        : funded.depositTx
          ? `https://testnet.arcscan.app/tx/${funded.depositTx}`
          : undefined,
      policy: { ...nanoPolicy, agentWallet: gateway.address },
      balanceUsdc: balances.wallet.formatted,
      gatewayBalanceUsdc: balances.gateway.formattedAvailable,
      nanopay: {
        amount: paid.formattedAmount,
        settlementTx,
        data: paid.data,
      },
    };
  } catch (nanoErr) {
    const msg = nanoErr instanceof Error ? nanoErr.message : String(nanoErr);
    if (!allowFallback) {
      return {
        status: 'skipped',
        reason: `Circle nanopayment failed: ${msg}`,
        chainId: arcTestnet.id,
        policy: nanoPolicy,
      };
    }
    return nativeFallback({ pk, treasury, amount, agentWallet, nanoError: msg });
  }
}

async function nativeFallback(opts: {
  pk: Hex;
  treasury: Address;
  amount: string;
  agentWallet: string | null;
  nanoError: string;
}): Promise<ArcActionResult> {
  const policy = loadPolicy(opts.agentWallet, 'native-fallback');
  const account = privateKeyToAccount(opts.pk);
  const wallet = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });

  const balance = await publicClient.getBalance({ address: account.address });
  const balanceUsdc = formatEther(balance);
  const value = parseEther(opts.amount);

  if (balance < value) {
    return {
      status: 'skipped',
      reason: `Nanopay failed (${opts.nanoError}); native fallback also short on gas USDC (have ${balanceUsdc})`,
      chainId: arcTestnet.id,
      policy: { ...policy, agentWallet: account.address },
      balanceUsdc,
    };
  }

  const hash = await wallet.sendTransaction({
    to: opts.treasury,
    value,
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return {
    status: 'executed',
    reason: `Native USDC fallback after nanopay error: ${opts.nanoError.slice(0, 160)}`,
    txHash: hash,
    chainId: arcTestnet.id,
    explorerUrl: `https://testnet.arcscan.app/tx/${hash}`,
    policy: { ...policy, agentWallet: account.address },
    balanceUsdc,
  };
}
