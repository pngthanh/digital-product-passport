import {
  INSPECTION_REGISTRY_ABI,
  OWNERSHIP_TRANSFER_ABI,
  PARTY_REGISTRY_ABI,
  PRODUCT_PASSPORT_ABI,
  SERVICE_TICKET_MANAGER_ABI,
  WARRANTY_MANAGER_ABI,
} from '@dpp/shared';
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

  it('ServiceTicketManager', async () => {
    const { abi } = await artifacts.readArtifact('ServiceTicketManager');
    expect(SERVICE_TICKET_MANAGER_ABI).to.deep.equal(abi);
  });

  it('InspectionRegistry', async () => {
    const { abi } = await artifacts.readArtifact('InspectionRegistry');
    expect(INSPECTION_REGISTRY_ABI).to.deep.equal(abi);
  });

  it('OwnershipTransfer', async () => {
    const { abi } = await artifacts.readArtifact('OwnershipTransfer');
    expect(OWNERSHIP_TRANSFER_ABI).to.deep.equal(abi);
  });

  it('WarrantyManager', async () => {
    const { abi } = await artifacts.readArtifact('WarrantyManager');
    expect(WARRANTY_MANAGER_ABI).to.deep.equal(abi);
  });
});
