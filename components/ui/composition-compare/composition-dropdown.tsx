import React, { useRef } from 'react';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { Icon } from '@teambit/design.elements.icon';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';

import styles from './composition-dropdown.module.scss';

export type DropdownItem = { id: string; label: string; href?: string; onClick?: (id: string, e) => void };

export type CompositionDropdownProps = {
  selected?: Omit<DropdownItem, 'value'>;
  dropdownItems: Array<DropdownItem>;
};

export function CompositionDropdown(props: CompositionDropdownProps) {
  const { selected, dropdownItems: data } = props;
  const key = (item: DropdownItem) => `${item.id}-${item.href}`;

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
        return <MenuItem key={key(item)} current={item} selected={selected} />;
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

  // const isCurrent = selected?.id === current.id;
  const currentVersionRef = useRef<HTMLDivElement>(null);

  // useEffect(() => {
  //   if (isCurrent) {
  //     currentVersionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  //   }
  // }, [isCurrent]);

  const onClick = (!!current.onClick && ((e) => current.onClick?.(current.id, e))) || undefined;

  return (
    <div ref={currentVersionRef} key={`${current.href}-container`}>
      {/* @ts-ignore */}
      <MenuLinkItem key={current.href} active={current.id === selected?.id} href={current.href} onClick={onClick}>
        <div>{current.label}</div>
      </MenuLinkItem>
    </div>
  );
}
