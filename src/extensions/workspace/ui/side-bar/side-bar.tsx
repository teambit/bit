import React from 'react';
import { Input } from '@bit/bit.evangelist.input.input';
import { ComponentTree } from './component-tree';
import styles from './styles.module.scss';
import { Component } from '../../../component/component.ui';

type SideBarProps = {
  components: Component[];
  selected?: string;
  onSelectComponent: (component: Component) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function SideBar({ components, selected, onSelectComponent, ...rest }: SideBarProps) {
  return (
    <div {...rest}>
      {/* :TODO filter components upon search */}
      <Input placeholder="find components" error={false} className={styles.input} />
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
