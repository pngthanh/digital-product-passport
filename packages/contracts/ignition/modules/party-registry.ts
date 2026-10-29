import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { parseEther } from 'ethers';

/** Phí đăng ký tổ chức theo phương án A của nhóm: 8 MON (gas do mạng thu riêng). */
export const DEFAULT_REGISTRATION_FEE = parseEther('8');

/**
 * Deploy PartyRegistry. `admin` (DEFAULT_ADMIN_ROLE, duyệt tổ chức) và `treasury` (ví nhận phí)
 * mặc định là ví deploy; `registrar` là địa chỉ của khoá ký giấy phép mà API dùng
 * (REGISTRAR_SIGNER_PRIVATE_KEY), không cần nạp MON.
 */
export default buildModule('PartyRegistryModule', (m) => {
  const admin = m.getParameter('admin', m.getAccount(0));
  const registrar = m.getParameter<string>('registrar');
  const treasury = m.getParameter('treasury', m.getAccount(0));
  const registrationFee = m.getParameter('registrationFee', DEFAULT_REGISTRATION_FEE);
  const partyRegistry = m.contract('PartyRegistry', [admin, registrar, treasury, registrationFee]);
  return { partyRegistry };
});
