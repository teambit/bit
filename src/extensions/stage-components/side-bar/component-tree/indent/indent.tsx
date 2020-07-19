import { CSSProperties } from 'react';

import styles from './indent.module.scss';

export const indentClass = styles.indent;
export const indentMargin = styles.indentMargin;

export function indentStyle(depth: number): CSSProperties {
  return {
    '--indent-depth': depth,
  } as CSSProperties;
}
