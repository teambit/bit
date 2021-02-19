import React, { ReactNode, HTMLAttributes } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Tooltip } from '@teambit/ui.tooltip';
import styles from './menu-widget-icon.module.scss';

export type MenuWidgetIconProps = {
  tooltipContent: ReactNode;
  icon: string;
} & HTMLAttributes<HTMLDivElement>;

export function MenuWidgetIcon({ tooltipContent, icon }: MenuWidgetIconProps) {
  return (
    <Tooltip placement="bottom" offset={[0, 15]} content={tooltipContent}>
      <div className={styles.widgetMenuIcon}>
        <Icon of={icon} className={styles.icon} />
      </div>
    </Tooltip>
  );
}
