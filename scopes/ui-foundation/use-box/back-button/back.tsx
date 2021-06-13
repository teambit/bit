import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './back.module.scss';

export type BackProps = {
  setActive: (active: string) => void;
  prevTab: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Back({ prevTab, setActive, className, ...rest }: BackProps) {
  return (
    <div {...rest} className={classNames(styles.back, className)}>
      <div onClick={() => setActive(prevTab)}>
        <Icon of="leftarrow" />
        <span>Back</span>
      </div>
    </div>
  );
}
