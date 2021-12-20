import React, { useState, ReactNode } from 'react';
import classNames from 'classnames';
import AnimateHeight from 'react-animate-height';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import styles from './tab-content.module.scss';

export type ExpandableTabContentProps = {
  content?: ReactNode;
  drawerContent?: ReactNode;
  drawerTitle?: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function ExpandableTabContent({ content, drawerContent, drawerTitle, ...rest }: ExpandableTabContentProps) {
  const [open, toggle] = useState(false);
  const iconStyles = open ? styles.open : '';
  return (
    <TabContent
      {...rest}
      bottom={
        <>
          <div className={classNames(linkStyles, styles.drawer)} onClick={() => toggle(!open)}>
            <div>{drawerTitle}</div>
            <Icon of="down-rounded-corners" className={iconStyles} />
          </div>
          <AnimateHeight height={open ? 'auto' : 0}>{drawerContent}</AnimateHeight>
        </>
      }
    >
      {content}
    </TabContent>
  );
}
