import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './back.module.scss';

export type BackProps = {
  onClick: (active: string) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function Back({ onClick, className, ...rest }: BackProps) {
  return (
    <div {...rest} className={classNames(styles.back, className)}>
      <div onClick={onClick}>
        <Icon of="leftarrow" />
        <span>Back</span>
      </div>
    </div>
  );
}
