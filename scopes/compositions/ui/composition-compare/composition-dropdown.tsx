import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import React, { useEffect, useRef } from 'react';
import styles from './composition-dropdown.module.scss';

export type DropdownItem = { id: string; label: string; value: string };

export type CompositionDropdownProps = {
  selected?: Omit<DropdownItem, 'value'>;
  dropdownItems: Array<DropdownItem>;
};

export function CompositionDropdown(props: CompositionDropdownProps) {
  const { selected, dropdownItems: data } = props;

  return (
    <Dropdown
      dropClass={styles.menu}
      placeholder={
        <div className={styles.placeholder}>
          <div>{selected && selected.label}</div>
          <Icon of="fat-arrow-down" />
        </div>
      }
    >
      {data.map((item) => {
        return <MenuItem key={item.id} current={item} selected={selected} />;
      })}
    </Dropdown>
  );
}

type MenuItemProps = {
  selected?: Omit<DropdownItem, 'value'>;
  current: DropdownItem;
};

function MenuItem(props: MenuItemProps) {
  const { selected, current } = props;

  const isCurrent = selected?.id === current.id;
  const currentVersionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCurrent) {
      currentVersionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isCurrent]);

  return (
    <div ref={currentVersionRef}>
      <MenuLinkItem active={current.id === selected?.id} href={current.value}>
        <div>{current.label}</div>
      </MenuLinkItem>
    </div>
  );
}
