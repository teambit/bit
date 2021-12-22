import React, { useState } from 'react';
import classNames from 'classnames';
import { Dropdown, DropdownProps } from '@teambit/evangelist.surfaces.dropdown';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './dropdown.module.scss';

export type UseBoxDropdownProps = {
  Menu: React.ReactElement;
  containerClass?: string;
} & Omit<DropdownProps, 'placeholder'>;

export function UseBoxDropdown({ className, Menu, ...rest }: UseBoxDropdownProps) {
  const [key, setKey] = useState(0);
  const DropdownMenu = React.cloneElement(Menu, { key });
  return (
    <Dropdown
      className={classNames(className)}
      {...rest}
      onChange={(_e, open) => open && setKey((x) => x + 1)} // to reset menu to initial state when toggling
      dropClass={styles.menu}
      placeholder={<Placeholder />}
      clickToggles={false}
      clickPlaceholderToggles={true}
    >
      {DropdownMenu}
    </Dropdown>
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
