import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';

import { PillLabel } from '../pill-label';
import styles from './scope-labels.module.scss';

type ScopeLabelsProps = {
  visibility: string;
  license: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeLabels({ visibility, license, className }: ScopeLabelsProps) {
  const visibilityIcon = visibility === 'public' ? 'world' : 'lock';
  return (
    <div className={classNames(styles.pillsContainer, className)}>
      <PillLabel>
        <Icon of={visibilityIcon} className={styles.pillIcon} />
        {visibility}
      </PillLabel>
      <PillLabel>
        <Icon of="license-round" className={styles.pillIcon} />
        {license.toUpperCase()}
      </PillLabel>
    </div>
  );
}
