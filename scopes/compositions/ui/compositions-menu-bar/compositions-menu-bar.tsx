import React, { ReactNode } from 'react';
import classnames from 'classnames';

import styles from './compositions-menu-bar.module.scss';

interface CompositionsMenuBarProps extends React.HTMLAttributes<HTMLDivElement> {
  widgetsStart?: ReactNode[];
  widgetsEnd?: ReactNode[];
}

export function CompositionsMenuBar({ className, widgetsStart, widgetsEnd, ...rest }: CompositionsMenuBarProps) {
  if (!widgetsEnd?.length || !widgetsEnd.length) return null;

  return (
    <div {...rest} className={classnames(className, styles.compositionsMenuBar)} style={{}}>
      {!!widgetsStart?.length && <div>{widgetsStart}</div>}
      <div className={styles.spacer}></div>
      {!!widgetsEnd?.length && <div>{widgetsEnd}</div>}
    </div>
  );
}
