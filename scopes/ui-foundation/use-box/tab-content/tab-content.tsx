import React from 'react';

import styles from './tab-content.module.scss';

export type TabContentProps = {
  children?: React.ReactNode;
  bottom?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function TabContent({ children, bottom, ...rest }: TabContentProps) {
  return (
    <div {...rest}>
      <div className={styles.middle}>{children}</div>
      <div className={styles.bottom}>{bottom}</div>
    </div>
  );
}
