import { TopicMessageSubmitTransaction, Client, PrivateKey, AccountId } from '@hiero-ledger/sdk';

let client: Client | null = null;

function getClient(): Client | null {
  if (client) return client;
  const accountId = process.env.HEDERA_SERVICE_ACCOUNT_ID;
  const key = process.env.HEDERA_SERVICE_PRIVATE_KEY;
  if (!accountId || !key) return null;
  client = Client.forTestnet();
  client.setOperator(AccountId.fromString(accountId), PrivateKey.fromStringECDSA(key));
  return client;
}

/** Best-effort HCS audit trail for x402 settlements (Hedera extra points). */
export async function appendAudit(message: Record<string, unknown>): Promise<string | null> {
  const topicId = process.env.HEDERA_HCS_TOPIC_ID;
  if (!topicId) return null;
  const c = getClient();
  if (!c) return null;
  try {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message))
      .execute(c);
    const receipt = await tx.getReceipt(c);
    return `${topicId}@${receipt.status.toString()}`;
  } catch (err) {
    console.warn('HCS audit failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
