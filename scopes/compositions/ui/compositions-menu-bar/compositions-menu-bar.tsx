import React, { useMemo } from 'react';
import classnames from 'classnames';
import flatten from 'lodash.flatten';
import { MenuBarWidgetsSlot } from '@teambit/compositions/compositions.ui.runtime';
import styles from './compositions-menu-bar.module.scss';

interface CompositionsMenuBarProps extends React.HTMLAttributes<HTMLDivElement> {
  menuBarWidgets?: MenuBarWidgetsSlot;
}

export function CompositionsMenuBar({ className, menuBarWidgets, ...rest }: CompositionsMenuBarProps) {
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
    <div {...rest} className={classnames(className, styles.compositionsMenuBar)} style={{}}>
      {!!widgetsStart?.length && <div>{widgetsStart}</div>}
      <div className={styles.spacer}></div>
      {!!widgetsEnd?.length && <div>{widgetsEnd}</div>}
    </div>
  );
}
