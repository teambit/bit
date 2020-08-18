import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { TooltipDrawer } from '@teambit/evangelist-temp.surfaces.tooltip';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import styles from './main-dropdown.module.scss';
import { hoverable } from '../../../to-eject/css-components/hoverable';

// type MainDropdownProps = {
// } & React.HTMLAttributes<HTMLDivElement>;

export function MainDropdown() {
  return (
    <div className={styles.mainDropdown}>
      <TooltipDrawer
        className={styles.dropdown}
        tooltipClass={styles.menu}
        placeholder=""
        clickOutside
        PlaceholderComponent={() => <Icon className={classNames(styles.icon)} of="more" />}
      >
        <div>
          <MenuBlock title="General">
            <div>
              <Line title="search" of="thin-arrow-up"></Line>
              <Line title="Command search" of="thin-arrow-up"></Line>
              <Line title="shortcuts" of="thin-arrow-up"></Line>
            </div>
          </MenuBlock>
          <MenuBlock title="component bar">
            <div>
              <Line title="Show component bar" of="thin-arrow-up"></Line>
              <Line title="Next component" of="thin-arrow-up"></Line>
              <Line title="Previous component" of="thin-arrow-up"></Line>
            </div>
          </MenuBlock>
          <MenuBlock title="tab navigation">
            <div>
              <Line title="Next tab" of="thin-arrow-up"></Line>
              <Line title="Previous tab" of="thin-arrow-up"></Line>
              <Line title="Go to Overview tab" of="thin-arrow-up"></Line>
              <Line title="Go to Compositions tab" of="thin-arrow-up"></Line>
              <Line title="Go to History tab" of="thin-arrow-up"></Line>
              <Line title="Go to Tests tab" of="thin-arrow-up"></Line>
              <Line title="Go to Version menu" of="thin-arrow-up"></Line>
            </div>
          </MenuBlock>
        </div>
      </TooltipDrawer>
    </div>
  );
}

function Line({ title, of }: { title: string; of: string }) {
  return (
    <div className={classNames(hoverable, styles.line)}>
      <div>{title}</div>
      <Icon of={of} className={styles.key} />
    </div>
  );
}

function MenuBlock({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className={classNames(styles.menuBlock)}>
      <div className={styles.title}>{title}</div>
      {children}
    </div>
  );
}
