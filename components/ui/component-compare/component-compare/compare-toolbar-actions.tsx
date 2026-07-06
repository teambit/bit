import React from 'react';
import { ToggleButton } from '@teambit/design.inputs.toggle-button';
import type { DiffMode } from './compare-toolbar';
import styles from './compare-toolbar.module.scss';

export type CompareToolbarActionsProps = {
  viewMode: string;
  diffMode: DiffMode;
  onDiffModeChange: (mode: DiffMode) => void;
  depsShowAll: boolean;
  onDepsShowAllChange: (showAll: boolean) => void;
};

/**
 * The compare app's default toolbar controls, composed into `CompareToolbar`'s generic `endActions`
 * slot. This is where the (legitimately compare-specific) mapping of active view → control lives, so
 * the toolbar itself stays agnostic. Views without a toolbar control render nothing.
 *  - code / config / tests → Split / Unified diff-mode toggle.
 *  - dependencies → Changed / All filter toggle (drives every deps panel via DepsFilterProvider).
 */
export function CompareToolbarActions({
  viewMode,
  diffMode,
  onDiffModeChange,
  depsShowAll,
  onDepsShowAllChange,
}: CompareToolbarActionsProps) {
  if (viewMode === 'code' || viewMode === 'config' || viewMode === 'tests') {
    return (
      <ToggleButton
        onOptionSelect={(idx) => onDiffModeChange(idx === 0 ? 'split' : 'unified')}
        defaultIndex={diffMode === 'split' ? 0 : 1}
        options={[
          { value: 'split', element: <span>Split</span> },
          { value: 'unified', element: <span>Unified</span> },
        ]}
        className={styles.diffModeToggle}
      />
    );
  }
  if (viewMode === 'dependencies') {
    return (
      <ToggleButton
        onOptionSelect={(idx) => onDepsShowAllChange(idx === 1)}
        defaultIndex={depsShowAll ? 1 : 0}
        options={[
          { value: 'changed', element: <span>Changed</span> },
          { value: 'all', element: <span>All</span> },
        ]}
        className={styles.diffModeToggle}
      />
    );
  }
  return null;
}
