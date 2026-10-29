import {
  type AdminDecision,
  FEE_ACTION_IDS,
  type OrganizationStage,
  type PartyRegistryAdminMethod,
} from '@dpp/shared';
import { apiRequest } from '@/lib/api-client';
import { sendRegistryTransaction, waitUntil } from '@/lib/wallet/send-registry-transaction';
import {
  adminDecisionCallSchema,
  adminOrganizationListSchema,
  adminOverviewSchema,
  trackedTransactionSchema,
} from '../organization/organization.schema';

/** Contract và ví Admin dùng cho mọi giao dịch quản trị. */
export interface AdminContext {
  chainId: number;
  contractAddress: string;
  wallet: string;
}

const TIMEOUT_MESSAGE =
  'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.';

async function sendAndReport(
  context: AdminContext,
  method: PartyRegistryAdminMethod,
  args: readonly unknown[],
): Promise<void> {
  const txHash = await sendRegistryTransaction({ ...context, method, args });
  await apiRequest('/admin/transactions', trackedTransactionSchema, {
    method: 'POST',
    body: { txHash, method },
  });
}

function waitForStage(organizationId: string, stage: OrganizationStage): Promise<void> {
  return waitUntil(async () => {
    const list = await apiRequest(
      `/admin/organizations?stage=${stage}`,
      adminOrganizationListSchema,
    );
    return list.items.some((item) => item.id === organizationId);
  }, TIMEOUT_MESSAGE);
}

/** ORG-02: ví Admin gửi approveOrganization; phí chuyển về Treasury. */
export async function approveOrganization(
  context: AdminContext,
  organization: { id: string; partyId: string },
): Promise<void> {
  await sendAndReport(context, 'approveOrganization', [organization.partyId]);
  await waitForStage(organization.id, 'AUTHORIZED');
}

/** ORG-03/04: lưu lý do ở API, ví Admin gửi rejectOrganization/disableOrganization kèm hash lý do. */
export async function decideOrganization(
  context: AdminContext,
  organizationId: string,
  decision: AdminDecision,
  reason: string,
): Promise<void> {
  const call = await apiRequest(
    `/admin/organizations/${organizationId}/decisions`,
    adminDecisionCallSchema,
    {
      method: 'POST',
      body: { decision, reason },
    },
  );
  await sendAndReport(context, call.method, [call.partyId, call.reasonHash]);
  await waitForStage(organizationId, decision === 'REJECT' ? 'REJECTED' : 'DISABLED');
}

/** ORG-06: đổi phí đăng ký tổ chức (wei). */
export async function updateRegistrationFee(
  context: AdminContext,
  amountWei: bigint,
): Promise<void> {
  await sendAndReport(context, 'setFee', [FEE_ACTION_IDS.ORG_REGISTRATION, amountWei]);
  await waitUntil(async () => {
    const overview = await apiRequest('/admin/overview', adminOverviewSchema);
    return overview.registrationFee?.amountWei === amountWei.toString();
  }, TIMEOUT_MESSAGE);
}

/** ORG-06: đổi ví Treasury nhận phí. */
export async function updateTreasury(context: AdminContext, treasury: string): Promise<void> {
  await sendAndReport(context, 'setTreasury', [treasury]);
  await waitUntil(async () => {
    const overview = await apiRequest('/admin/overview', adminOverviewSchema);
    return overview.registrationFee?.treasury.toLowerCase() === treasury.toLowerCase();
  }, TIMEOUT_MESSAGE);
}
