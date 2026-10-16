import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'link' | 'danger' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  primary: 'btn',
  link: 'linkish',
  danger: 'btn danger-btn',
  icon: 'icon-btn',
};

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return <button type={type} className={classes || undefined} {...props} />;
}
