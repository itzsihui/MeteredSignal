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

/** Arc Testnet — USDC is the native gas token (18 decimals on-chain). */
export const arcTestnet = defineChain({
  id: Number(process.env.ARC_CHAIN_ID ?? 5042002),
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

export type ArcSpendPolicy = {
  /** Only spend when Graph verdict is GO */
  requireGoVerdict: true;
  maxSpendUsdc: string;
  treasury: string | null;
  agentWallet: string | null;
};

export type ArcActionResult = {
  status: 'executed' | 'skipped' | 'dry_run';
  reason: string;
  txHash?: string;
  chainId?: number;
  explorerUrl?: string;
  policy: ArcSpendPolicy;
  balanceUsdc?: string;
};

function loadPolicy(agentWallet: string | null): ArcSpendPolicy {
  return {
    requireGoVerdict: true,
    maxSpendUsdc: process.env.ARC_SPEND_AMOUNT_USDC ?? '0.01',
    treasury: process.env.ARC_TREASURY_ADDRESS?.trim() || null,
    agentWallet,
  };
}

/**
 * On GO: send a small native USDC amount on Arc Testnet.
 * Guardrails: GO-only + hard spend cap (ARC_SPEND_AMOUNT_USDC).
 * Configure ARC_AGENT_PRIVATE_KEY + ARC_TREASURY_ADDRESS.
 */
export async function maybeExecuteArcUsdc(opts: {
  verdict: 'GO' | 'NO_GO' | 'UNAVAILABLE';
}): Promise<ArcActionResult> {
  const pkRaw = process.env.ARC_AGENT_PRIVATE_KEY?.trim();
  const treasury = process.env.ARC_TREASURY_ADDRESS as Address | undefined;
  const amount = process.env.ARC_SPEND_AMOUNT_USDC ?? '0.01';

  let agentWallet: string | null = null;
  if (pkRaw) {
    try {
      const pk = (pkRaw.startsWith('0x') ? pkRaw : `0x${pkRaw}`) as Hex;
      if (/^0x[0-9a-fA-F]{64}$/.test(pk)) {
        agentWallet = privateKeyToAccount(pk).address;
      }
    } catch {
      agentWallet = null;
    }
  }

  const policy = loadPolicy(agentWallet);

  if (opts.verdict !== 'GO') {
    return {
      status: 'skipped',
      reason: `Verdict ${opts.verdict} — agent refuses Arc USDC spend (policy: require GO)`,
      policy,
    };
  }

  if (!pkRaw || !treasury) {
    return {
      status: 'dry_run',
      reason:
        'Arc credentials missing (ARC_AGENT_PRIVATE_KEY, ARC_TREASURY_ADDRESS). Would send native USDC on GO.',
      chainId: arcTestnet.id,
      policy,
    };
  }

  const pk = (pkRaw.startsWith('0x') ? pkRaw : `0x${pkRaw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    return {
      status: 'skipped',
      reason: 'ARC_AGENT_PRIVATE_KEY must be 32-byte hex (0x + 64 hex chars)',
      chainId: arcTestnet.id,
      policy,
    };
  }

  const account = privateKeyToAccount(pk);
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
  const value = parseEther(amount);

  if (balance < value) {
    return {
      status: 'skipped',
      reason: `Insufficient Arc USDC: have ${balanceUsdc}, need ${amount}`,
      chainId: arcTestnet.id,
      policy: { ...policy, agentWallet: account.address },
      balanceUsdc,
    };
  }

  const hash = await wallet.sendTransaction({
    to: treasury,
    value,
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return {
    status: 'executed',
    reason: `Sent ${amount} native USDC to treasury after GO signal (spend cap enforced)`,
    txHash: hash,
    chainId: arcTestnet.id,
    explorerUrl: `https://testnet.arcscan.app/tx/${hash}`,
    policy: { ...policy, agentWallet: account.address },
    balanceUsdc,
  };
}
