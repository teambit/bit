export const WRITE_TITLE = (total: number) => `${total} config files added to workspace`;

const SUMMARY_INTRO = `bit writes configuration files in different nested locations in your workspace to meet the configuration needs of different components.`;

export const SUMMARY = `${SUMMARY_INTRO}
IDE is now in-sync with component configuration`;

/**
 * when config files of the user were skipped, the IDE is not fully in-sync, so don't claim it is.
 */
export const SUMMARY_WITH_SKIPPED = `${SUMMARY_INTRO}
IDE is in-sync with component configuration, except for the files above, which bit left as they are`;

export function getSummary(skippedPaths: string[] = []): string {
  return skippedPaths.length ? SUMMARY_WITH_SKIPPED : SUMMARY;
}
