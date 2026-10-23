import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'link' | 'danger' | 'icon' | 'plain';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  primary: 'btn',
  link: 'linkish',
  danger: 'btn danger-btn',
  icon: 'icon-btn',
  plain: undefined,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, type = 'button', ...props },
  ref
) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return <button ref={ref} type={type} className={classes || undefined} {...props} />;
});
