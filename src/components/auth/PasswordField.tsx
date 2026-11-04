"use client";

/**
 * Premium password input with a show/hide affordance (PART 2/3/4). One
 * control used by login, signup and both reset screens so behavior (eye
 * toggle, masked input, autocomplete hints, error styling) stays identical
 * everywhere. The input is a controlled component; validation copy is
 * supplied by the owning form.
 */

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  /** Reveal toggle hidden until a value exists (clean empty state). */
  revealWhenEmpty?: boolean;
  /** Extra hint line under the field (e.g. length requirement), shown when
   *  there is no error. */
  hint?: string;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  placeholder,
  revealWhenEmpty = false,
  hint,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const describedById = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const showToggle = revealWhenEmpty || value.length > 0;

  return (
    <div>
      <label htmlFor={id} className="type-label mb-2 block text-sm text-white/80">
        {label} <span className="text-white/40">*</span>
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          data-revealed={revealed || undefined}
          className={`auth-input w-full py-3 pl-4 pr-12 text-sm ${
            showToggle ? "" : "pr-4"
          }`}
        />
        {showToggle ? (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            disabled={disabled}
            aria-pressed={revealed}
            aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            title={revealed ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors duration-200 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
          >
            {revealed ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-white/40">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
