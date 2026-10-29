import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

/**
 * Deploy ProductPassport trỏ tới PartyRegistry đã có: quyền nhà sản xuất và khoá ký giấy phép
 * (REGISTRAR_ROLE) đều đọc từ PartyRegistry, nên không cần cấp role riêng.
 */
export default buildModule('ProductPassportModule', (m) => {
  const partyRegistry = m.getParameter<string>('partyRegistry');
  const productPassport = m.contract('ProductPassport', [partyRegistry]);
  return { productPassport };
});
