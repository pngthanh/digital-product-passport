import type { SpecimenEvent, SpecimenEventCategory } from './specimen-data';

export type HistoryTabId = 'all' | SpecimenEventCategory;

export interface HistoryTab {
  id: HistoryTabId;
  label: string;
  /** Câu hiển thị khi tab không có sự kiện nào. */
  empty: string;
}

export const HISTORY_TABS: readonly HistoryTab[] = [
  { id: 'all', label: 'Tất cả', empty: 'Chưa có sự kiện nào được ghi nhận.' },
  { id: 'distribution', label: 'Phân phối', empty: 'Chưa có lần phát hành hay bàn giao nào.' },
  { id: 'service', label: 'Bảo hành', empty: 'Chưa có lần kích hoạt bảo hành hay sửa chữa nào.' },
  { id: 'ownership', label: 'Chuyển nhượng', empty: 'Chưa có lần đổi chủ nào.' },
];

export function eventsOfTab(
  events: readonly SpecimenEvent[],
  tab: HistoryTabId,
): readonly SpecimenEvent[] {
  return tab === 'all' ? events : events.filter((event) => event.category === tab);
}
