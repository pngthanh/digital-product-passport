import type { Route } from 'next';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-tint',
  ghost: 'text-ink hover:bg-tint',
  danger: 'bg-bad text-white hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-[15px]',
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: ButtonStyleProps): string {
  return cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

export function ButtonLink<T extends string>({
  href,
  children,
  variant,
  size,
  className,
}: ButtonStyleProps & { href: Route<T>; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })}>
      {children}
    </Link>
  );
}
