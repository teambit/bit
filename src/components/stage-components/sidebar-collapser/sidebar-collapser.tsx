import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import styles from './sidebar-collapser.module.scss';

type CollapserProps = {
  isOpen: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function Collapser({ isOpen, onClick, ...rest }: CollapserProps) {
  console.log('isOpen', isOpen);
  return (
    <div {...rest} onClick={onClick} className={classNames(styles.collapser, { [styles.open]: isOpen })}>
      <div className={styles.circle}>
        <div>
          <Icon of="right-rounded-corners" />
        </div>
      </div>
    </div>
  );
}
