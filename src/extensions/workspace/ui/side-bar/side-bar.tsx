import React from 'react';
import { Input } from '@bit/bit.evangelist.input.input';
import { ComponentTree } from './component-tree';

import styles from './styles.module.scss';

type SideBarProps = {
  components: { id: string }[];
  selected?: string;
  onSelectComponent: (id?: string) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function SideBar({ components, selected, onSelectComponent, ...rest }: SideBarProps) {
  return (
    <div {...rest}>
      <Input placeholder="find components" error={false} className={styles.input} />
      <ComponentTree selected={selected} onSelect={onSelectComponent} components={components.map(x => x.id)} />
    </div>
  );
}
