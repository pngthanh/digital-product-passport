import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

/**
 * Deploy PartyRegistry. `admin` mặc định là ví deploy; `registrar` là địa chỉ của khoá
 * ký giấy phép mà API dùng (REGISTRAR_SIGNER_PRIVATE_KEY), không cần nạp MON.
 */
export default buildModule('PartyRegistryModule', (m) => {
  const admin = m.getParameter('admin', m.getAccount(0));
  const registrar = m.getParameter<string>('registrar');
  const partyRegistry = m.contract('PartyRegistry', [admin, registrar]);
  return { partyRegistry };
});
