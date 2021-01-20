import React, { ReactNode, HTMLAttributes } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import ReactTooltip from 'react-tooltip';
import styles from './menu-widget-icon.module.scss';

export type MenuWidgetIconProps = {
  tooltipContent: ReactNode;
  id: string;
  icon: string;
} & HTMLAttributes<HTMLDivElement>;

export function MenuWidgetIcon({ tooltipContent, id, icon }: MenuWidgetIconProps) {
  return (
    <div className={styles.widgetMenuIcon} data-tip="" data-for={id}>
      <Icon of={icon} className={styles.icon} />
      <ReactTooltip place="bottom" id={id} effect="solid" offset={{ bottom: 15 }}>
        {tooltipContent}
      </ReactTooltip>
    </div>
  );
}
