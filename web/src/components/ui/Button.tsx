import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'cyan';
type Size    = 'sm' | 'md' | 'lg' | 'xl' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  Variant;
  size?:     Size;
  loading?:  boolean;
  icon?:     React.ReactNode;
  as?:       'button' | 'a';
  href?:     string;
}

export function Button({
  children,
  variant  = 'primary',
  size     = 'md',
  loading  = false,
  icon,
  className = '',
  disabled,
  as: Tag  = 'button',
  ...props
}: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, `btn-${size}`, className].filter(Boolean).join(' ');

  return (
    <Tag
      className={cls}
      disabled={disabled || loading}
      {...(props as any)}
    >
      {loading ? (
        <span className="btn-spinner" />
      ) : icon ? (
        <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      ) : null}
      {children}
    </Tag>
  );
}