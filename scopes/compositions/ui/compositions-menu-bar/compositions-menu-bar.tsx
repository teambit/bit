import React, { useMemo } from 'react';
import classnames from 'classnames';
import flatten from 'lodash.flatten';
import { CompositionsMenuSlot } from '@teambit/compositions';
import styles from './compositions-menu-bar.module.scss';

interface CompositionsMenuBarProps extends React.HTMLAttributes<HTMLDivElement> {
  menuBarWidgets?: CompositionsMenuSlot;
}

export function CompositionsMenuBar({ className, menuBarWidgets, children, ...rest }: CompositionsMenuBarProps) {
  const widgetsStart = useMemo(
    () =>
      flatten(menuBarWidgets?.values())
        .filter(({ location }) => location === 'start')
        .map(({ content }, idx) => <React.Fragment key={idx}>{content}</React.Fragment>),
    [menuBarWidgets]
  );

  const widgetsEnd = useMemo(
    () =>
      flatten(menuBarWidgets?.values())
        .filter(({ location }) => location === 'end')
        .map(({ content }, idx) => <React.Fragment key={idx}>{content}</React.Fragment>),
    [menuBarWidgets]
  );

  if (!widgetsStart.length && !widgetsEnd.length) return null;

  return (
    <div {...rest} className={classnames(className, styles.compositionsMenuBar)}>
      {!!(widgetsStart?.length || children) && (
        <div>
          {widgetsStart} {children}
        </div>
      )}
      <div className={styles.spacer}></div>
      {!!widgetsEnd?.length && <div>{widgetsEnd}</div>}
    </div>
  );
}
