/** Nguồn thời gian thay được trong test; mã nghiệp vụ không gọi `new Date()` trực tiếp. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const SYSTEM_CLOCK: Clock = { now: () => new Date() };
