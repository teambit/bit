import { mutedText } from '@teambit/base-ui.text.muted-text';
import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React from 'react';

import styles from './scope-title.module.scss';

type ScopeTitleProps = {
  owner: string;
  scopeName: string;
} & React.HTMLAttributes<HTMLHeadingElement>;

export function ScopeTitle({ owner, scopeName, className }: ScopeTitleProps) {
  return (
    <H1 className={styles.title} size="sm">
      <span className={classNames(mutedText, styles.orgName, className)}>{owner}/</span>
      <span>{scopeName}</span>
    </H1>
  );
}
