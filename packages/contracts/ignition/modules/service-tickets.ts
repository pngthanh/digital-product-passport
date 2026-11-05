import { SERVICE_CONTRACT_ROLE } from '@dpp/shared';
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

/**
 * M7: deploy ServiceTicketManager trỏ tới PartyRegistry, ProductPassport, WarrantyManager đã có, rồi
 * cấp SERVICE_CONTRACT_ROLE để nó tạm dừng, tiếp tục bảo hành. Ví deploy phải còn quyền Admin trên
 * PartyRegistry.
 */
export default buildModule('ServiceTicketModule', (m) => {
  const partyRegistry = m.getParameter<string>('partyRegistry');
  const productPassport = m.getParameter<string>('productPassport');
  const warrantyManager = m.getParameter<string>('warrantyManager');
  const registry = m.contractAt('PartyRegistry', partyRegistry);
  const serviceTicketManager = m.contract('ServiceTicketManager', [
    partyRegistry,
    productPassport,
    warrantyManager,
  ]);
  m.call(registry, 'grantRole', [SERVICE_CONTRACT_ROLE, serviceTicketManager], {
    id: 'GrantServiceContractRole',
  });
  return { serviceTicketManager };
});
