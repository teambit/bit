import React, { useMemo, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { Input } from '@bit/bit.evangelist.input.input';
import { ComponentTree } from './component-tree';
import { Component } from '../../../component/component.ui';
import styles from './styles.module.scss';

type SideBarProps = {
  components: Component[];
  selected?: string;
  onSelectComponent?: (component: Component) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function SideBar({ components, selected, onSelectComponent, ...rest }: SideBarProps) {
  const componentIds = useMemo(() => components.map(x => x.id), [components]);
  const history = useHistory();

  const handleSelect = useCallback(
    (id: string, event?: React.MouseEvent) => {
      event?.preventDefault();

      const path = makeComponentUrl(id);
      return history.push(path);
    },
    [history]
  );

  return (
    <div {...rest}>
      <Input placeholder="find components" error={false} className={styles.input} />
      <ComponentTree selected={selected} onSelect={handleSelect} components={componentIds} />
    </div>
  );
}

// @TODO - move this to router extension
function makeComponentUrl(id: string) {
  return `/${id}${getStickyUrl()}`;
}

function getStickyUrl() {
  if (typeof window === 'undefined') return '';

  const [, section] = window.location.pathname.split('~');

  return section ? `/~${section}` : '';
}
