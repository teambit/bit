import React from 'react';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { LevelIcon, Level } from '@teambit/ui.elements.level-icon';
import { backgrounds } from '@teambit/base-ui.surfaces.background';
import { Separator } from '@teambit/documenter.ui.separator';
import classNames from 'classnames';
import styles from './info-card.module.scss';

interface InfoCardProps extends CardProps {
  /**
   * title to be shown in the card
   */
  title: string;
  /**
   * Level of Icon, info, error, warning, success
   */
  level: Level;
}

export function InfoCard({ title, children, className, level, ...rest }: InfoCardProps) {
  return (
    <Card className={classNames(backgrounds.dent, styles.infoCard, className)} {...rest}>
      <LevelIcon level={level} className={classNames(styles.icon, className)} />
      {title}
      <Separator className={classNames(styles.separator, className)} />
      {children}
    </Card>
  );
}
