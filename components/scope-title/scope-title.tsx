import { mutedText } from '@teambit/base-ui.text.muted-text';
import { H3 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React from 'react';

import styles from './scope-title.module.scss';

type ScopeTitleProps = {
  owner: string;
  scopeName: string;
} & React.HTMLAttributes<HTMLHeadingElement>;

export function ScopeTitle({ owner, scopeName, className }: ScopeTitleProps) {
  return (
    // TODO - @oded - replace with h1 once I remove possibleSizes from the heading component
    <H3 className={styles.title}>
      <span className={classNames(mutedText, styles.orgName, className)}>{owner}/</span>
      <span>{scopeName}</span>
    </H3>
  );
}
