import { mutedText } from '@teambit/base-ui-temp.text.muted-text';
import { H3 } from '@teambit/documenter-temp.ui.heading';
import classNames from 'classnames';
import React from 'react';

import styles from './scope-title.module.scss';

type ScopeTitleProps = {
  org: string;
  scopeName: string;
} & React.HTMLAttributes<HTMLHeadingElement>;

export function ScopeTitle({ org, scopeName, className }: ScopeTitleProps) {
  return (
    // TODO - @oded - replace with h1 once I remove possibleSizes from the heading component
    <H3 className={styles.title}>
      <span className={classNames(mutedText, styles.orgName, className)}>{org}/</span>
      <span>{scopeName}</span>
    </H3>
  );
}
