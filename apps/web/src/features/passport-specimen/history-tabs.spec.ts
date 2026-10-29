import { describe, expect, it } from 'vitest';
import { eventsOfTab, HISTORY_TABS } from './history-tabs';
import { SPECIMEN_PASSPORT } from './specimen-data';

const { events } = SPECIMEN_PASSPORT;

describe('Tab lịch sử hộ chiếu', () => {
  it('tab "Tất cả" giữ nguyên thứ tự mới nhất trước', () => {
    expect(eventsOfTab(events, 'all')).toEqual(events);
  });

  it('mỗi sự kiện thuộc đúng một tab nhóm, không sót sự kiện nào', () => {
    const grouped = HISTORY_TABS.filter((tab) => tab.id !== 'all').flatMap((tab) =>
      eventsOfTab(events, tab.id),
    );

    expect(grouped).toHaveLength(events.length);
    expect(new Set(grouped.map((event) => event.id)).size).toBe(events.length);
  });

  it('tab "Chuyển nhượng" chỉ có lần bán đầu và các lần đổi chủ', () => {
    expect(eventsOfTab(events, 'ownership').map((event) => event.title)).toEqual([
      'Chuyển quyền sở hữu sang chủ mới',
      'Bán lần đầu cho chủ sở hữu',
    ]);
  });
});
