import { mutedText } from '@teambit/base-ui.text.muted-text';
import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React from 'react';
import { UserAvatar } from '@teambit/design.ui.avatar';

import styles from './scope-title.module.scss';

type ScopeTitleProps = {
  scopeName: string;
  icon?: string;
} & React.HTMLAttributes<HTMLHeadingElement>;

export function ScopeTitle({ scopeName, icon, className }: ScopeTitleProps) {
  return (
    <H1 className={styles.title} size="sm">
      <UserAvatar size={32} account={{ name: scopeName.split('.')[1] || scopeName, profileImage: icon }} />
      <span className={classNames(mutedText, styles.orgName, className)}>{scopeName.replace('.', '/')}</span>
    </H1>
  );
}
