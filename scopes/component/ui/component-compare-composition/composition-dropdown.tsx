import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import React from 'react';
import styles from './composition-dropdown.module.scss';

export type DropdownItem = { label: string; value: string };

export type CompositionDropdownProps = {
  selected: DropdownItem,
  dropdownItems: Array<DropdownItem>;
};

export function CompositionDropdown(props: CompositionDropdownProps) {
  const { selected, dropdownItems: data } = props;

  return (
    <Dropdown
      dropClass={styles.menu}
      placeholder={
        <div className={styles.placeholder}>
          <div>{selected.label}</div>
          <Icon of="fat-arrow-down" />
        </div>
      }
    >
      <div>
        {data.map((item, index) => {
          return (
            <MenuLinkItem key={index} isActive={() => false} href={item.value}>
              <div>{item.label}</div>
            </MenuLinkItem>
          );
        })}
      </div>
    </Dropdown>
  );
}
