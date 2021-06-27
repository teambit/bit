import React from 'react';
import classNames from 'classnames';
import { Icon, IconProps } from '@teambit/evangelist.elements.icon';
import { colorPalette } from '@teambit/base-ui.theme.accent-color';
import styles from './level-icon.module.scss';

interface LevelIconProps extends Omit<IconProps, 'of'> {
  /**
   * different icons are show by changing the level
   */
  level: Level;
}

export type Level = 'error' | 'warning' | 'success' | 'info';

export function LevelIcon({ level, className, ...rest }: LevelIconProps) {
  if (level === 'error') {
    return (
      <Icon
        of="error-circle"
        role="img"
        aria-label={level}
        className={classNames(styles.notificationIcon, colorPalette.action, className)}
        {...rest}
      />
    );
  }

  if (level === 'info') {
    return (
      <Icon
        of="info-circle"
        role="img"
        aria-label={level}
        className={classNames(styles.notificationIcon, colorPalette.process, className)}
        {...rest}
      />
    );
  }

  if (level === 'warning') {
    return (
      <Icon
        of="warn-circle"
        role="img"
        aria-label={level}
        className={classNames(styles.notificationIcon, colorPalette.consider, className)}
        {...rest}
      />
    );
  }

  if (level === 'success') {
    return (
      <Icon
        of="billing-checkmark"
        role="img"
        aria-label={level}
        className={classNames(styles.notificationIcon, colorPalette.continue, className)}
        {...rest}
      />
    );
  }
  return null;
}
