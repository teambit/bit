import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import styles from './message-card.module.scss';

export type MessageCardProps = {
  icon?: string;
  title?: string;
  iconClass?: string;
} & CardProps;

/**
 * A box to display an informative message to the user
 */
export function MessageCard({
  icon,
  title,
  className,
  children,
  iconClass,
  roundness = 'small',
  elevation = 'none',
  ...rest
}: MessageCardProps) {
  return (
    <Card {...rest} roundness={roundness} elevation={elevation} className={classNames(styles.messageCard, className)}>
      {icon && <Icon of={icon} className={classNames(styles.icon, iconClass)} />}
      <div className={styles.textBox}>
        <div>{title}</div>
        {children}
      </div>
    </Card>
  );
}
