/**
 * Associate an HTS token (e.g. USDC) with a Hedera account.
 * Usage:
 *   HEDERA_ACCOUNT_ID=0.0.x HEDERA_PRIVATE_KEY=0x... npm run associate -w scripts
 * Optional: TOKEN_ID=0.0.429274 HEDERA_NETWORK=testnet
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  AccountId,
  Client,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
} from '@hiero-ledger/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const accountId = process.env.HEDERA_ACCOUNT_ID;
const key = process.env.HEDERA_PRIVATE_KEY;
const tokenId = process.env.TOKEN_ID ?? '0.0.429274'; // Hedera testnet USDC
const network = process.env.HEDERA_NETWORK ?? 'testnet';

if (!accountId || !key) {
  console.error('Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY');
  process.exit(1);
}

const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
client.setOperator(AccountId.fromString(accountId), PrivateKey.fromStringECDSA(key));

const tx = await new TokenAssociateTransaction()
  .setAccountId(accountId)
  .setTokenIds([TokenId.fromString(tokenId)])
  .execute(client);

const receipt = await tx.getReceipt(client);
console.log(`Associated ${tokenId} to ${accountId}: ${receipt.status.toString()}`);
client.close();
