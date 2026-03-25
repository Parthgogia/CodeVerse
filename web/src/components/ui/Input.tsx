import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:    string;
  error?:    string;
  icon?:     React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <div className="input-wrap">
        {icon && <span className="input-icon">{icon}</span>}
        <input
          ref={ref}
          className={[
            'input',
            icon ? 'has-icon' : '',
            error ? 'input-error' : '',
            className,
          ].filter(Boolean).join(' ')}
          {...props}
        />
      </div>
      {error && <span className="input-error-msg">{error}</span>}
    </div>
  )
);

Input.displayName = 'Input';

// ── Select ────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', children, ...props }, ref) => (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <select
        ref={ref}
        className={['input select', error ? 'input-error' : '', className].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </select>
      {error && <span className="input-error-msg">{error}</span>}
    </div>
  )
);

Select.displayName = 'Select';