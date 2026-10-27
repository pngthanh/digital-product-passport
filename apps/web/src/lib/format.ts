const DATE_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const TIME_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Ho_Chi_Minh',
});

const NUMBER_FORMAT = new Intl.NumberFormat('vi-VN');

export function formatDate(value: Date | string): string {
  return DATE_FORMAT.format(new Date(value));
}

export function formatTime(value: Date | string): string {
  return TIME_FORMAT.format(new Date(value));
}

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}
