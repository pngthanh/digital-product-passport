import { TRANSFER_CONTRACT_ROLE } from '@dpp/shared';
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

/**
 * M9: deploy OwnershipTransfer trỏ tới PartyRegistry, ProductPassport, ServiceTicketManager đã có,
 * rồi cấp TRANSFER_CONTRACT_ROLE để nó gọi `ProductPassport.transferOwnership`. Ví deploy phải còn
 * quyền Admin trên PartyRegistry.
 */
export default buildModule('OwnershipTransferModule', (m) => {
  const partyRegistry = m.getParameter<string>('partyRegistry');
  const productPassport = m.getParameter<string>('productPassport');
  const serviceTicketManager = m.getParameter<string>('serviceTicketManager');
  const registry = m.contractAt('PartyRegistry', partyRegistry);
  const ownershipTransfer = m.contract('OwnershipTransfer', [
    partyRegistry,
    productPassport,
    serviceTicketManager,
  ]);
  m.call(registry, 'grantRole', [TRANSFER_CONTRACT_ROLE, ownershipTransfer], {
    id: 'GrantTransferContractRole',
  });
  return { ownershipTransfer };
});
