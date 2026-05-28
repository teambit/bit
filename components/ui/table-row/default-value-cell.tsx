import React, { useMemo } from 'react';
import classNames from 'classnames';

import { formatSourceValue } from './format-source-value';
import styles from './table-row.module.scss';

export type DefaultValueCellProps = {
  /** Raw source string for the default value (as emitted by the schema extractor). */
  value: string;
  /**
   * Length threshold above which the value renders as a pretty-formatted code block.
   * Multiline values always render as a block regardless of length.
   */
  blockAt?: number;
  className?: string;
};

/**
 * Renders a default value. Short scalars (e.g. `'hosting'`, `MainRuntime`) render
 * inline; long object/array literals are pretty-formatted into a monospace block.
 */
export function DefaultValueCell({ value, blockAt = 60, className }: DefaultValueCellProps) {
  const isBlock = value.length > blockAt || value.includes('\n');
  const formatted = useMemo(() => (isBlock ? formatSourceValue(value) : value), [value, isBlock]);

  if (!isBlock) {
    return <span className={classNames(styles.defaultInline, className)}>{value}</span>;
  }

  return <pre className={classNames(styles.defaultExpanded, className)}>{formatted}</pre>;
}
