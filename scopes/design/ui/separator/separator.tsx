import classNames from 'classnames';
import React from 'react';
import { Separator as BaseSeparator } from '@teambit/documenter.ui.separator';
import styles from './separator.module.scss';

export type SeparatorProps = {
  /**
   *  show a visual separator instead of a semantic separator
   */
  isPresentational?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function Separator({ className, isPresentational, ...rest }: SeparatorProps) {
  if (isPresentational) {
    return <div className={classNames(styles.separator, className)} {...rest} />;
  }
  return <BaseSeparator className={classNames(className)} {...rest} />;
}
