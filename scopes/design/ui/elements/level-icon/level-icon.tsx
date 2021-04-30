import React from 'react';
import cn from 'classnames';
import { Icon, IconProps } from '@teambit/evangelist.elements.icon';
import { colorPalette } from '@teambit/base-ui.theme.color-palette';
import styles from './level-icon.module.scss';

interface LevelIconProps extends Omit<IconProps, 'of'> {
  /**
   * shows the levels of the icons
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
        aria-label="error"
        className={cn(styles.notificationIcon, colorPalette.impulse, className)}
        {...rest}
      />
    );
  }

  if (level === 'info') {
    return (
      <Icon
        of="info-circle"
        role="img"
        aria-label="info"
        className={cn(styles.notificationIcon, colorPalette.secondary, className)}
        {...rest}
      />
    );
  }

  if (level === 'warning') {
    return (
      <Icon
        of="warn-circle"
        role="img"
        aria-label="warn"
        className={cn(styles.notificationIcon, colorPalette.hunger, className)}
        {...rest}
      />
    );
  }

  if (level === 'success') {
    return (
      <Icon
        of="billing-checkmark"
        role="img"
        aria-label="success"
        className={cn(styles.notificationIcon, colorPalette.success, className)}
        {...rest}
      />
    );
  }
  return null;
}
