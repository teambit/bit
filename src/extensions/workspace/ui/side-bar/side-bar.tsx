import React from 'react';
import { Input } from '@bit/bit.evangelist.input.input';
import { ComponentTree } from './component-tree';
import styles from './styles.module.scss';
import { Component } from '../../../component/component.ui';
import { Icon } from '@bit/bit.evangelist.elements.icon';

type SideBarProps = {
  components: Component[];
  selected?: string;
  onSelectComponent: (component: Component) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function SideBar({ components, selected, onSelectComponent, ...rest }: SideBarProps) {
  return (
    <div {...rest}>
      {/* :TODO filter components upon search */}
      <div className={styles.inputWrapper}>
        <Input placeholder="Find components" error={false} className={styles.input} />
        <Icon of="discovery" className={styles.searchIcon} />
      </div>
      <ComponentTree
        selected={selected}
        onSelect={id => onSelectComponent(getComponentById(components, id))}
        components={components.map(x => x.id)}
      />
    </div>
  );
}

function getComponentById(components: Component[], id: string): Component {
  const component = components.find(comp => comp.id === id);
  if (!component) throw new Error();
  return component;
}
