import { LIFECYCLE_CONTRACT_ROLE } from '@dpp/shared';
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

/**
 * M10: deploy ProductLifecycle trỏ tới PartyRegistry, ProductPassport, ServiceTicketManager đã có,
 * rồi cấp LIFECYCLE_CONTRACT_ROLE để nó gọi `ProductPassport.setLifecycleState`. Ví deploy phải còn
 * quyền Admin trên PartyRegistry.
 */
export default buildModule('ProductLifecycleModule', (m) => {
  const partyRegistry = m.getParameter<string>('partyRegistry');
  const productPassport = m.getParameter<string>('productPassport');
  const serviceTicketManager = m.getParameter<string>('serviceTicketManager');
  const registry = m.contractAt('PartyRegistry', partyRegistry);
  const productLifecycle = m.contract('ProductLifecycle', [
    partyRegistry,
    productPassport,
    serviceTicketManager,
  ]);
  m.call(registry, 'grantRole', [LIFECYCLE_CONTRACT_ROLE, productLifecycle], {
    id: 'GrantLifecycleContractRole',
  });
  return { productLifecycle };
});
