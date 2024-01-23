import React, { useState, ReactNode } from 'react';
import classNames from 'classnames';
import AnimateHeight from 'react-animate-height';
import { Icon } from '@teambit/evangelist.elements.icon';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import { TabContent } from './tab-content';
import styles from './tab-content.module.scss';

export type ExpandableTabContentProps = {
  // @deprecated - collides with html content type which is a string. use @tabContent
  content?: ReactNode;
  tabContent?: ReactNode;
  drawerContent?: ReactNode;
  drawerTitle?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'content'>;

export function ExpandableTabContent({
  tabContent,
  content,
  drawerContent,
  drawerTitle,
  ...rest
}: ExpandableTabContentProps) {
  const [open, toggle] = useState(false);
  const iconStyles = open ? styles.open : '';
  return (
    <TabContent
      {...rest}
      bottom={
        drawerTitle &&
        drawerContent && (
          <>
            <div className={classNames(linkStyles, styles.drawer)} onClick={() => toggle(!open)}>
              <div>{drawerTitle}</div>
              <Icon of="down-rounded-corners" className={iconStyles} />
            </div>
            <AnimateHeight height={open ? 'auto' : 0}>{drawerContent}</AnimateHeight>
          </>
        )
      }
    >
      {tabContent || content}
    </TabContent>
  );
}
