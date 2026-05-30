import React from 'react';

export type InlineCompareEmptyProps = {
  /** primary message, e.g. "No code changes" / "No changes to compare" */
  message: string;
  /** optional secondary line with more context */
  hint?: string;
  /**
   * when both are provided, a base → compare version pill row is rendered. identical versions are
   * tinted neutral to signal "same version", different ones are color-coded (base neutral, compare accent).
   */
  baseVersion?: string;
  compareVersion?: string;
};

const ACCENT = 'var(--bit-accent-color, #6c5ce7)';
const MUTED = 'var(--on-background-medium-color, #a0aec0)';
const SECONDARY = 'var(--on-surface-medium-color, #707279)';
const PRIMARY = 'var(--on-surface-color, #1a1a2e)';
const BORDER = 'var(--border-medium-color, #e8ecf0)';
const SURFACE = 'var(--surface-color, #fff)';

function VersionPill({ version, tone }: { version: string; tone: 'neutral' | 'base' | 'compare' }) {
  const accent = tone === 'compare';
  return (
    <span
      style={{
        fontFamily: 'var(--font-family-monospace, ui-monospace, SFMono-Regular, Menlo, monospace)',
        fontSize: 13,
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: 8,
        border: `1px solid ${accent ? ACCENT : BORDER}`,
        background: accent ? 'rgba(108, 92, 231, 0.06)' : SURFACE,
        color: accent ? ACCENT : PRIMARY,
        whiteSpace: 'nowrap',
      }}
    >
      {version}
    </span>
  );
}

/**
 * Shared blank state for the compare surfaces (inline tabs, the single-component compare page,
 * and lane-compare). Renders in place of an empty body so a no-change comparison reads as an
 * intentional "nothing changed" state instead of a blank pane.
 */
export function InlineCompareEmpty({ message, hint, baseVersion, compareVersion }: InlineCompareEmptyProps) {
  const hasPills = !!baseVersion && !!compareVersion;
  const identical = hasPills && baseVersion === compareVersion;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '48px 16px',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600, color: PRIMARY }}>{message}</span>

      {hasPills && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <VersionPill version={baseVersion as string} tone={identical ? 'neutral' : 'base'} />
            <span style={{ color: MUTED, fontSize: 16 }}>→</span>
            <VersionPill version={compareVersion as string} tone={identical ? 'neutral' : 'compare'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: MUTED }}>
            <span style={{ minWidth: 64 }}>base</span>
            <span style={{ width: 16 }} />
            <span style={{ minWidth: 64 }}>compare</span>
          </div>
        </div>
      )}

      {hint && <span style={{ fontSize: 13, color: SECONDARY, maxWidth: 440, lineHeight: 1.5 }}>{hint}</span>}
    </div>
  );
}
