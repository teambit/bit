import React from 'react';
import { ComponentTree } from './component-tree';

type SideBarProps = {
  components: { id: string }[];
  selected?: string;
  onSelectComponent: (id?: string) => void;
};

export function SideBar({ components, selected, onSelectComponent }: SideBarProps) {
  return <ComponentTree selected={selected} onSelect={onSelectComponent} components={components.map(x => x.id)} />;
}
