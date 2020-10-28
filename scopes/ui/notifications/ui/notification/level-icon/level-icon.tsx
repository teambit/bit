import React from 'react';
import cn from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { MessageLevel } from '@teambit/notifications.api';
import { colorPalette } from '@teambit/base-ui.theme.color-palette';
import styles from './level-icon.module.scss';

export function LevelIcon({ level, className }: { level: MessageLevel; className: string }) {
  if (level === MessageLevel.error) {
    return <Icon of="error-circle" className={cn(styles.notificationIcon, colorPalette.impulse, className)} />;
  }
  if (level === MessageLevel.info) {
    return <Icon of="info-circle" className={cn(styles.notificationIcon, colorPalette.secondary, className)} />;
  }
  if (level === MessageLevel.warning) {
    return <Icon of="warn-circle" className={cn(styles.notificationIcon, colorPalette.hunger, className)} />;
  }
  if (level === MessageLevel.success) {
    return <Icon of="billing-checkmark" className={cn(styles.notificationIcon, colorPalette.success, className)} />;
  }
  return null;
}
