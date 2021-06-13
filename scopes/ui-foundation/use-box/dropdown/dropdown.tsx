import React, { useState, ComponentType } from 'react';
import classNames from 'classnames';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './dropdown.module.scss';

export type UseBoxDropdownProps = {
  Menu?: ComponentType;
  containerClass?: string;
  defaultActiveOption?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function UseBoxDropdown({ className, Menu, ...rest }: UseBoxDropdownProps) {
  const [activeTab, setActiveTab] = useState(0);
  if (!Menu) return null;
  return (
    <div className={classNames(styles.dropdown, className)} {...rest}>
      <Dropdown
        onChange={(_e, open) => open && setActiveTab((x) => x + 1)} // to reset menu to initial state when toggling
        dropClass={styles.menu}
        placeholder={<Placeholder />}
        clickToggles={false}
        clickPlaceholderToggles={true}
      >
        <Menu key={activeTab} />
      </Dropdown>
    </div>
  );
}

function Placeholder(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classNames(styles.placeholder)} {...props}>
      <Icon of="package" />
      <div className={styles.content}>Use</div>
      <Icon className={styles.content} of="fat-arrow-down" />
    </div>
  );
}
