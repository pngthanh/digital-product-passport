import { type AnomalyAlertView, shortenHex } from '@dpp/shared';
import { formatNumber } from '@/lib/format';
import { DETAIL_VALUE_LABELS } from './monitoring-labels';

type Details = AnomalyAlertView['details'];

const num = (details: Details, key: string): number | null => {
  const value = details[key];
  return typeof value === 'number' ? value : null;
};
const str = (details: Details, key: string): string | null => {
  const value = details[key];
  return typeof value === 'string' ? value : null;
};

/** Một dòng tóm tắt cho danh sách cảnh báo; chi tiết đầy đủ ở trang cảnh báo. */
export function alertHeadline(alert: AnomalyAlertView): string | null {
  const { details } = alert;
  switch (alert.ruleCode) {
    case 'TRANSACTION_STUCK': {
      const method = str(details, 'method');
      const minutes = num(details, 'waitingMinutes');
      return [method, minutes === null ? null : `chờ ${formatNumber(minutes)} phút`]
        .filter(Boolean)
        .join(' · ');
    }
    case 'WALLET_REPEATED_REVERTS': {
      const wallet = str(details, 'wallet');
      return `${wallet ? shortenHex(wallet, 6, 4) : 'Ví'} revert ${formatNumber(num(details, 'reverts') ?? 0)} lần trong ${formatNumber(num(details, 'windowMinutes') ?? 60)} phút`;
    }
    case 'INDEXER_LAGGING':
      return `Chậm ${formatNumber(num(details, 'behindMinutes') ?? 0)} phút so với block finalized`;
    case 'SIGN_IN_BRUTE_FORCE':
      return `${str(details, 'email') ?? 'Email'} sai ${formatNumber(num(details, 'failures') ?? 0)} lần trong ${formatNumber(num(details, 'windowMinutes') ?? 15)} phút`;
    case 'RAPID_OWNERSHIP_CHANGES':
      return `Đổi chủ ${formatNumber(num(details, 'changes') ?? 0)} lần trong ${formatNumber(num(details, 'windowDays') ?? 7)} ngày`;
    case 'SERVICE_TICKET_OVERDUE':
      return `Phiếu mở ${formatNumber(num(details, 'openDays') ?? 0)} ngày`;
    case 'REQUEST_STALE': {
      const kind = str(details, 'kind');
      return `Yêu cầu ${(kind ? (DETAIL_VALUE_LABELS[kind] ?? kind) : '').toLowerCase()} chờ ${formatNumber(num(details, 'waitingDays') ?? 0)} ngày`;
    }
    default: {
      const event = str(details, 'eventName') ?? str(details, 'event');
      return event ? `Event ${event}` : null;
    }
  }
}

export type DetailDisplay =
  | { kind: 'tx'; value: string }
  | { kind: 'address'; value: string }
  | { kind: 'hash'; value: string }
  | { kind: 'time'; value: string }
  | { kind: 'text'; value: string };

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Cách hiển thị một giá trị trong `details`: giao dịch, ví mở trên explorer; thời gian theo giờ VN. */
export function detailDisplay(key: string, value: string | number | boolean | null): DetailDisplay {
  if (value === null) {
    return { kind: 'text', value: 'Không có' };
  }
  if (typeof value === 'boolean') {
    return { kind: 'text', value: value ? 'Có' : 'Không' };
  }
  if (typeof value === 'number') {
    return { kind: 'text', value: formatNumber(value) };
  }
  if (TX_HASH.test(value)) {
    return { kind: /txhash$/i.test(key) ? 'tx' : 'hash', value };
  }
  if (ADDRESS.test(value)) {
    return { kind: 'address', value };
  }
  if (ISO_TIME.test(value)) {
    return { kind: 'time', value };
  }
  return { kind: 'text', value: DETAIL_VALUE_LABELS[value] ?? value };
}
