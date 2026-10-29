import { PRODUCT_CONTRACT_ROLE } from '@dpp/shared';
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

/**
 * M6: deploy WarrantyManager và ProductPassport (phiên bản 2) trỏ tới PartyRegistry đã có, rồi cấp
 * PRODUCT_CONTRACT_ROLE cho ProductPassport để nó kích hoạt bảo hành khi bán. Ví deploy phải còn
 * quyền Admin trên PartyRegistry. Quyền tổ chức và khoá ký giấy phép vẫn đọc từ PartyRegistry.
 */
export default buildModule('ProductPassportModule', (m) => {
  const partyRegistry = m.getParameter<string>('partyRegistry');
  const registry = m.contractAt('PartyRegistry', partyRegistry);
  const warrantyManager = m.contract('WarrantyManager', [partyRegistry]);
  const productPassport = m.contract('ProductPassport', [partyRegistry, warrantyManager]);
  m.call(registry, 'grantRole', [PRODUCT_CONTRACT_ROLE, productPassport], {
    id: 'GrantProductContractRole',
  });
  return { productPassport, warrantyManager };
});
