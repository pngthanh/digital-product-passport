import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

/**
 * M8: deploy InspectionRegistry trỏ tới PartyRegistry và ProductPassport đã có. Contract chỉ đọc hai
 * contract đó (quyền đơn vị kiểm định, trạng thái sản phẩm) nên không cần cấp role nào.
 */
export default buildModule('InspectionModule', (m) => {
  const partyRegistry = m.getParameter<string>('partyRegistry');
  const productPassport = m.getParameter<string>('productPassport');
  const inspectionRegistry = m.contract('InspectionRegistry', [partyRegistry, productPassport]);
  return { inspectionRegistry };
});
