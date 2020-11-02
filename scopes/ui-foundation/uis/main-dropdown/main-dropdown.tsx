import { Icon } from '@teambit/evangelist.elements.icon';
import { TooltipDrawer } from '@teambit/evangelist.surfaces.tooltip';
import classNames from 'classnames';
import React, { ReactNode } from 'react';
import { SlotRegistry } from '@teambit/harmony';
import { KeyCombo } from '@teambit/ui.keycap';
import styles from './main-dropdown.module.scss';

export type MenuItem = {
  category?: string;
  title: ReactNode;
  keyChar?: string;
  handler: () => void;
};

export type MenuItemSlot = SlotRegistry<MenuItem[]>;

type MainDropdownProps = {
  menuItems: ItemsByCategory;
} & React.HTMLAttributes<HTMLDivElement>;

type ItemsByCategory = {
  [key: string]: MenuItem[];
};

export function MainDropdown({ menuItems }: MainDropdownProps) {
  return (
    <div className={styles.mainDropdown}>
      <TooltipDrawer
        className={styles.dropdown}
        tooltipClass={styles.menu}
        placeholder=""
        clickOutside
        PlaceholderComponent={() => (
          <div>
            <div className={styles.overlay} />
            <Icon className={classNames(styles.icon)} of="more" />
          </div>
        )}
      >
        <div>
          {Object.keys(menuItems).map((category, index) => {
            return (
              <MenuBlock key={index} title={category}>
                {menuItems[category].map((item) => {
                  return (
                    item && (
                      <Line
                        key={`${item.title}${item.keyChar}`}
                        lineTitle={item.title}
                        keyChar={item.keyChar}
                        onClick={item.handler}
                      ></Line>
                    )
                  );
                })}
              </MenuBlock>
            );
          })}
        </div>
      </TooltipDrawer>
    </div>
  );
}

type LineProps = {
  lineTitle: ReactNode;
  keyChar?: string;
} & React.HTMLAttributes<HTMLDivElement>;

function Line({ lineTitle, keyChar, onClick, ...rest }: LineProps) {
  return (
    <div {...rest} className={classNames(styles.line)} onClick={onClick}>
      <div>{lineTitle}</div>
      {keyChar && (
        <pre>
          <KeyCombo>{keyChar}</KeyCombo>
        </pre>
      )}
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
