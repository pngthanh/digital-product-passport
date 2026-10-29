import { PARTY_REGISTRY_ABI, PRODUCT_PASSPORT_ABI, WARRANTY_MANAGER_ABI } from '@dpp/shared';
import { expect } from 'chai';
import { artifacts } from 'hardhat';

describe('ABI trong @dpp/shared khớp contract đã biên dịch', () => {
  it('PartyRegistry: nếu lệch, chạy `pnpm --filter @dpp/contracts abi:export`', async () => {
    const { abi } = await artifacts.readArtifact('PartyRegistry');
    expect(PARTY_REGISTRY_ABI).to.deep.equal(abi);
  });

  it('ProductPassport', async () => {
    const { abi } = await artifacts.readArtifact('ProductPassport');
    expect(PRODUCT_PASSPORT_ABI).to.deep.equal(abi);
  });

  it('WarrantyManager', async () => {
    const { abi } = await artifacts.readArtifact('WarrantyManager');
    expect(WARRANTY_MANAGER_ABI).to.deep.equal(abi);
  });
});
