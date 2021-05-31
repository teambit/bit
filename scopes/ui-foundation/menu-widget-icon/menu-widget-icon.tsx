import React, { ReactNode, HTMLAttributes } from 'react';
import classnames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './menu-widget-icon.module.scss';

export type MenuWidgetIconProps = {
  tooltipContent: ReactNode;
  icon: string;
} & HTMLAttributes<HTMLDivElement>;

export function MenuWidgetIcon({ tooltipContent, icon, className, ...rest }: MenuWidgetIconProps) {
  return (
    <Tooltip placement="bottom" offset={[0, 15]} content={tooltipContent}>
      <div {...rest} className={classnames(styles.widgetMenuIcon, className)}>
        <Icon of={icon} className={styles.icon} />
      </div>
    </Tooltip>
  );
}
