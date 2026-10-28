import { PARTY_REGISTRY_ABI } from '@dpp/shared';
import { expect } from 'chai';
import { artifacts } from 'hardhat';

describe('ABI trong @dpp/shared khớp contract đã biên dịch', () => {
  it('PartyRegistry: nếu lệch, chạy `pnpm --filter @dpp/contracts abi:export`', async () => {
    const { abi } = await artifacts.readArtifact('PartyRegistry');
    expect(PARTY_REGISTRY_ABI).to.deep.equal(abi);
  });
});
