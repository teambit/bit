import React from 'react';
import classNames from 'classnames';
import styles from './panel.module.scss';

export type PanelContainerProps = React.HTMLAttributes<HTMLDivElement>;
export type PanelProps = React.HTMLAttributes<HTMLDivElement>;

export function PanelContainer(props: PanelContainerProps) {
  return <div {...props} className={classNames(styles.container, props.className)} />;
}

export function Panel(props: PanelProps) {
  return <div {...props} className={styles.panel} />;
}
