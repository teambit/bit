import React from 'react';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { LevelIcon, Level } from '@teambit/ui.elements.level-icon';
import { backgrounds } from '@teambit/base-ui.surfaces.background';
import { H3 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import { Separator } from '@teambit/ui.separator';
import styles from './alert-card.module.scss';

export interface AlertCardProps extends CardProps {
  /**
   * title to be shown in the card
   */
  title: string;
  /**
   * Level of Icon, info, error, warning, success
   */
  level: Level;
}

export function AlertCard({ title, children, className, level, ...rest }: AlertCardProps) {
  return (
    <Card className={classNames(backgrounds.dent, styles.card, className)} {...rest}>
      <div className={classNames(styles.heading, className)}>
        <LevelIcon level={level} className={classNames(styles.icon, className)} />
        <H3 size="xs" className={classNames(styles.title, className)}>
          {title}
        </H3>
      </div>
      <Separator isPresentational className={classNames(styles.separator, className)} />
      {children}
    </Card>
  );
}
