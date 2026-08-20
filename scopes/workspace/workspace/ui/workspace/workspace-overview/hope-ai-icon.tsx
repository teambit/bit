import React, { useRef } from 'react';

/**
 * Inlined copy of `@teambit/hope.design.hope-icon`'s `HopeAiIcon`.
 * Inlined here because the original lives in a private scope; replace with the
 * package import once it is publicly available.
 */

let counter = 0;

function useGradientIds() {
  const ref = useRef<{ idle: string; active: string } | null>(null);
  if (!ref.current) {
    counter += 1;
    ref.current = {
      idle: `hopeAiIdle${counter}`,
      active: `hopeAiActive${counter}`,
    };
  }
  return ref.current;
}

export type HopeAiIconProps = {
  /** Whether the icon is in active/loading state. */
  active?: boolean;
  /** Icon size in pixels. */
  size?: number;
  /** Additional class name. */
  className?: string;
};

export function HopeAiIcon({ active = false, size = 24, className }: HopeAiIconProps) {
  const { idle, active: activeId } = useGradientIds();
  const s = active ? `url(#${activeId})` : `url(#${idle})`;

  return (
    <svg
      viewBox="-2 -2 28 28"
      fill="none"
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-flex', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={idle} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6B8FA8">
            <animate
              attributeName="stop-color"
              values="#6B8FA8;#7B6DB8;#A06B8F;#6B8FA8"
              dur="8s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="#A06B8F">
            <animate
              attributeName="stop-color"
              values="#A06B8F;#6B8FA8;#7B6DB8;#A06B8F"
              dur="8s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>
        <linearGradient id={activeId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7EC8E3">
            <animate
              attributeName="stop-color"
              values="#7EC8E3;#9B72F2;#F06B8A;#7EC8E3"
              dur="3s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="#F06B8A">
            <animate
              attributeName="stop-color"
              values="#F06B8A;#7EC8E3;#9B72F2;#F06B8A"
              dur="3s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>
      </defs>
      {/* main star */}
      <path
        d="M12 2.5L13.8 10.2L21.5 12L13.8 13.8L12 21.5L10.2 13.8L2.5 12L10.2 10.2L12 2.5Z"
        stroke={s}
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      >
        {active && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 12 12;12 12 12;-12 12 12;0 12 12"
            dur="1s"
            repeatCount="indefinite"
          />
        )}
      </path>
      {/* top-right mini sparkle */}
      <path
        d="M21 3L21.6 4.8L23.4 5.4L21.6 6L21 7.8L20.4 6L18.6 5.4L20.4 4.8L21 3Z"
        stroke={s}
        strokeWidth="0.8"
        strokeLinejoin="round"
        fill="none"
      >
        {active && <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite" />}
      </path>
      {/* bottom-left mini sparkle */}
      <path
        d="M3.5 17.5L4 19L5.5 19.5L4 20L3.5 21.5L3 20L1.5 19.5L3 19L3.5 17.5Z"
        stroke={s}
        strokeWidth="0.8"
        strokeLinejoin="round"
        fill="none"
      >
        {active && (
          <animate attributeName="opacity" values="1;0.15;1" dur="0.9s" begin="0.3s" repeatCount="indefinite" />
        )}
      </path>
    </svg>
  );
}
