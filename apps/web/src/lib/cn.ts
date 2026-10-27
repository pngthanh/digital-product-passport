import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Gộp class Tailwind, lớp truyền sau ghi đè lớp trước. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
