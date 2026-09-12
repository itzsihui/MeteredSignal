/** Messari Standardized Lending subgraphs (decentralized network query IDs). */

export type ProtocolDeployment = {
  slug: string;
  protocol: string;
  network: string;
  subgraphId: string;
  schemaVersion: string;
};

/** Curated set used by MeteredSignal — one query shape across all of these. */
export const LENDING_REGISTRY: ProtocolDeployment[] = [
  {
    slug: 'aave-v3-ethereum',
    protocol: 'aave-v3',
    network: 'mainnet',
    subgraphId: 'JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk',
    schemaVersion: '3.1.0',
  },
  {
    // Messari aave-v3-base (D7mapex…) currently has no allocations on the network.
    slug: 'aave-v3-arbitrum',
    protocol: 'aave-v3',
    network: 'arbitrum',
    subgraphId: '4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf',
    schemaVersion: '3.1.0',
  },

  {
    slug: 'compound-v3-ethereum',
    protocol: 'compound-v3',
    network: 'mainnet',
    subgraphId: 'AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9',
    schemaVersion: '3.1.0',
  },
  {
    slug: 'spark-lend-ethereum',
    protocol: 'spark-lend',
    network: 'mainnet',
    subgraphId: 'GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si',
    schemaVersion: '3.1.0',
  },
];

export function getDeployments(slugs?: string[]): ProtocolDeployment[] {
  if (!slugs?.length) return LENDING_REGISTRY;
  const set = new Set(slugs);
  return LENDING_REGISTRY.filter((d) => set.has(d.slug));
}
