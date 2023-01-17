import React, { useState } from 'react';
import classNames from 'classnames';
import { Dropdown, DropdownProps } from '@teambit/evangelist.surfaces.dropdown';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './dropdown.module.scss';

export type UseBoxDropdownProps = {
  Menu: React.ReactElement;
  containerClass?: string;
  actionName?: string;
  actionIcon?: string;
} & Omit<DropdownProps, 'placeholder'>;

export function UseBoxDropdown({ className, Menu, actionName, actionIcon, ...rest }: UseBoxDropdownProps) {
  const [key, setKey] = useState(0);
  const DropdownMenu = React.cloneElement(Menu, { key });
  return (
    <Dropdown
      className={classNames(className)}
      {...rest}
      onChange={(_e, open) => open && setKey((x) => x + 1)} // to reset menu to initial state when toggling
      dropClass={styles.menu}
      placeholder={<Placeholder actionName={actionName} actionIcon={actionIcon} />}
      clickToggles={false}
      clickPlaceholderToggles={true}
    >
      {DropdownMenu}
    </Dropdown>
  );
}

export type PlaceholderProps = {
  actionName?: string;
  actionIcon?: string;
} & React.HTMLAttributes<HTMLDivElement>;

function Placeholder({ actionName = 'Use', actionIcon = 'package', ...rest }: PlaceholderProps) {
  return (
    <div className={classNames(styles.placeholder)} {...rest}>
      <Icon of={actionIcon} />
      <div className={styles.content}>{actionName}</div>
      <Icon className={styles.content} of="fat-arrow-down" />
    </div>
  );
}
