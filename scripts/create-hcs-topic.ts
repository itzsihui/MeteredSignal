/**
 * Create an HCS topic for x402 settlement audit logs.
 * Usage: npm run create-topic -w scripts
 * Prints the topic id and appends HEDERA_HCS_TOPIC_ID to .env if missing.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
} from '@hiero-ledger/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
config({ path: envPath });

const accountId = process.env.HEDERA_SERVICE_ACCOUNT_ID;
const key = process.env.HEDERA_SERVICE_PRIVATE_KEY;

if (!accountId || !key) {
  console.error('Set HEDERA_SERVICE_ACCOUNT_ID and HEDERA_SERVICE_PRIVATE_KEY in .env');
  process.exit(1);
}

const client = Client.forTestnet();
client.setOperator(AccountId.fromString(accountId), PrivateKey.fromStringECDSA(key));

const tx = await new TopicCreateTransaction()
  .setTopicMemo('MeteredSignal x402 settlement audit (ETHOnline 2026)')
  .execute(client);

const receipt = await tx.getReceipt(client);
const topicId = receipt.topicId?.toString();
if (!topicId) {
  console.error('Topic create succeeded but no topicId in receipt');
  process.exit(1);
}

console.log(`Created HCS topic: ${topicId}`);
console.log(`HashScan: https://hashscan.io/testnet/topic/${topicId}`);

if (existsSync(envPath)) {
  let env = readFileSync(envPath, 'utf8');
  if (/^HEDERA_HCS_TOPIC_ID=/m.test(env)) {
    env = env.replace(/^HEDERA_HCS_TOPIC_ID=.*$/m, `HEDERA_HCS_TOPIC_ID=${topicId}`);
  } else {
    env = env.trimEnd() + `\n\n# HCS audit trail for x402 settlements\nHEDERA_HCS_TOPIC_ID=${topicId}\n`;
  }
  writeFileSync(envPath, env);
  console.log('Updated .env with HEDERA_HCS_TOPIC_ID');
}

client.close();
