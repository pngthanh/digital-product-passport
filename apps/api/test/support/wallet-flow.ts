import { PARTY_REGISTRY_ABI, type WalletLinkAuthorization } from '@dpp/shared';
import { Contract, type JsonRpcSigner } from 'ethers';
import type TestAgent from 'supertest/lib/agent.js';

/** Web: xin challenge, ví ký EIP-4361, xin giấy phép EIP-712. */
export async function authorize(
  agent: TestAgent,
  wallet: JsonRpcSigner,
  purpose: 'LINK' | 'ROTATE',
  password?: string,
): Promise<WalletLinkAuthorization> {
  const challenge = await agent
    .post('/api/v1/me/wallet-links/challenge')
    .send({ address: wallet.address, purpose })
    .expect(201);
  const signature = await wallet.signMessage(challenge.body.message);
  const authorization = await agent
    .post('/api/v1/me/wallet-links/authorize')
    .send({ challengeToken: challenge.body.challengeToken, signature, password })
    .expect(201);
  return authorization.body;
}

/** MetaMask: ví được gắn tự gửi giao dịch kèm giấy phép và tự trả gas. */
export async function submit(wallet: JsonRpcSigner, authorization: WalletLinkAuthorization) {
  const registry = new Contract(authorization.contractAddress, PARTY_REGISTRY_ABI, wallet);
  const args =
    authorization.method === 'registerUser'
      ? [authorization.partyId, BigInt(authorization.deadline), authorization.signature]
      : [
          authorization.partyId,
          authorization.previousWallet,
          BigInt(authorization.deadline),
          authorization.signature,
        ];
  const tx = await registry.getFunction(authorization.method)(...args);
  await tx.wait();
  return tx.hash.toLowerCase();
}
