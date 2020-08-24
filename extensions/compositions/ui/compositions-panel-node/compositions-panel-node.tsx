import classNames from 'classnames';
import React from 'react';

import styles from './compositions-panel-node.module.scss';

export type CompositionsPanelNodeProps = {
  name: string;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  isActive: boolean;
} & React.HTMLAttributes<HTMLLIElement>;

export function CompositionsPanelNode({ name, onClick, isActive, ...rest }: CompositionsPanelNodeProps) {
  return (
    <li {...rest}>
      <div className={classNames(styles.linkWrapper, { [styles.active]: isActive })}>
        <a className={styles.panelLink} onClick={onClick}>
          {name}
        </a>
      </div>
    </li>
  );
}
