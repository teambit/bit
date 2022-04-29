import React from 'react';
import classNames from 'classnames';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { H1 } from '@teambit/documenter.ui.heading';
import { ScopeIcon } from '@teambit/scope.ui.scope-icon';

import styles from './scope-title.module.scss';

type ScopeTitleProps = {
  scopeName: string;
  icon?: string;
  backgroundIconColor?: string;
  iconClassName?: string;
} & React.HTMLAttributes<HTMLHeadingElement>;

// temporary fix because the API not return the backgroundIconColor from the scope style.
const DEFAULT_COLOR = '#babec9';

export function ScopeTitle({
  scopeName,
  icon,
  backgroundIconColor = DEFAULT_COLOR,
  className,
  iconClassName,
}: ScopeTitleProps) {
  // TODO: move the className to H1 from span
  return (
    <H1 className={styles.title} size="sm">
      <ScopeIcon
        size={32}
        displayName={scopeName.split('.')[1] || scopeName}
        scopeImage={icon}
        bgColor={backgroundIconColor}
        className={iconClassName}
      />
      <span className={classNames(mutedText, styles.orgName, className)}>{scopeName.replace('.', '/')}</span>
    </H1>
  );
}
