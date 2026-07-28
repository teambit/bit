import type { APIDiffResult, ImpactLevel, SchemaUnavailableReason } from './api-diff-model';

/** semver-flavored display label for an impact level */
export function impactLabel(impact: ImpactLevel | string): string {
  switch (impact) {
    case 'BREAKING':
      return 'MAJOR';
    case 'NON_BREAKING':
      return 'MINOR';
    default:
      return 'PATCH';
  }
}

const REASON_TEXT: Record<SchemaUnavailableReason, string> = {
  NOT_BUILT: 'was built before API extraction, so no API snapshot exists',
  NO_EXTRACTOR: "env doesn't provide a schema extractor",
  DISABLED: 'has schema extraction disabled',
  FAILED: 'API data could not be loaded',
};

/**
 * human-readable explanation of why the diff could not be computed.
 * returns undefined when the diff was computed.
 */
export function unavailableText(
  result: APIDiffResult,
  baseVersion?: string,
  compareVersion?: string
): string | undefined {
  const ver = (v?: string) => (v ? ` ${v.slice(0, 7)}` : '');
  switch (result.status) {
    case 'BASE_UNAVAILABLE':
      return `base version${ver(baseVersion)} ${REASON_TEXT[result.base.reason || 'FAILED']}`;
    case 'COMPARE_UNAVAILABLE':
      return `compare version${ver(compareVersion)} ${REASON_TEXT[result.compare.reason || 'FAILED']}`;
    case 'UNAVAILABLE': {
      const baseReason = REASON_TEXT[result.base.reason || 'FAILED'];
      const compareReason = REASON_TEXT[result.compare.reason || 'FAILED'];
      if (baseReason === compareReason) return `neither version has API data (${baseReason})`;
      return `neither version has API data (base ${baseReason}; compare ${compareReason})`;
    }
    default:
      return undefined;
  }
}
