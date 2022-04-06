import { ComponentModel } from '@teambit/component';
import React from 'react';

import styles from './component-result.module.scss';

type ComponentResultProps = {
  component: ComponentModel;
};

export function ComponentResult({ component }: ComponentResultProps) {
  const name = component.id.fullName;
  const icon = component.environment?.icon;
  const iconAlt = component.environment?.id;

  return (
    <>
      {icon && <img src={icon} alt={iconAlt} className={styles.icon} />}
      <div className={styles.name}>{name}</div>
    </>
  );
}
