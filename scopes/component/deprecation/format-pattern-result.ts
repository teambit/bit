import type { ComponentID } from '@teambit/component-id';
import { formatSuccessSummary, formatHint, formatSection, formatItem, joinSections } from '@teambit/cli';

export type PatternResultLabels = {
  /** past-tense verb used in the success messages and the changed-section title, e.g. "deprecated" */
  verb: string;
  /** section title for the components that were left unchanged, e.g. "already deprecated" */
  unchangedTitle: string;
  /** describes the unchanged state in the "no changes" hint, e.g. "already deprecated" */
  unchangedState: string;
};

/**
 * shared output formatting for the pattern-based deprecate/undeprecate commands: a single-line summary
 * for the common single-component case, a hint when nothing changed, or a sectioned summary listing the
 * changed and unchanged components.
 */
export function formatPatternResult(
  pattern: string,
  changed: ComponentID[],
  unchanged: ComponentID[],
  labels: PatternResultLabels
): string {
  // preserve the familiar single-line message when only one component is affected
  if (changed.length === 1 && !unchanged.length) {
    return formatSuccessSummary(`the component "${changed[0].toString()}" has been ${labels.verb} successfully`);
  }
  if (!changed.length) {
    return formatHint(
      `all ${unchanged.length} component(s) matching "${pattern}" are ${labels.unchangedState}. no changes have been made`
    );
  }

  return joinSections([
    formatSuccessSummary(`${changed.length} component(s) have been ${labels.verb} successfully`),
    formatSection(
      labels.verb,
      '',
      changed.map((id) => formatItem(id.toString()))
    ),
    formatSection(
      labels.unchangedTitle,
      'no changes were made to these',
      unchanged.map((id) => formatItem(id.toString()))
    ),
  ]);
}
