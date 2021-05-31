import React from 'react';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { LevelIcon, Level } from '@teambit/design.ui.elements.level-icon';
import { backgrounds } from '@teambit/base-ui.surfaces.background';
import { H3, Sizes } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import { Separator } from '@teambit/design.ui.separator';
import styles from './alert-card.module.scss';

export type { Sizes, Level };

export interface AlertCardProps extends CardProps {
  /**
   * title to be shown in the card
   */
  title: string;
  /**
   * Level of Icon, info, error, warning, success
   */
  level: Level;
  /**
   *  Size of the title
   */
  titleSize?: Sizes;
}

export function AlertCard({ title, titleSize = 'xxs', children, className, level, ...rest }: AlertCardProps) {
  return (
    <Card className={classNames(backgrounds.dent, styles.card, className)} {...rest}>
      <div className={classNames(styles.heading, className)}>
        <LevelIcon level={level} className={classNames(styles.icon, className)} />
        <H3 size={titleSize} className={classNames(styles.title, className)}>
          {title}
        </H3>
      </div>
      <Separator isPresentational className={classNames(styles.separator, className)} />
      {children}
    </Card>
  );
}
