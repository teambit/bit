import React, { useCallback, useEffect, useState, useMemo } from 'react';
import classNames from 'classnames';
import { Card } from '@teambit/base-ui.surfaces.card';
import { Keybinding } from '@teambit/keyboard-shortcuts';
import { AutoCompleteInput } from '@teambit/command-bar.autocomplete-input';
import styles from './command-bar.module.scss';

export type CommandObj = {
  id: string;
  key?: Keybinding;
  name: string;
  description?: string;
};

export interface ChildProps {
  execute: () => void;
  active: boolean;
}

export type CommandBarProps = {
  visible: boolean;
  term: string;
  onClose: () => void;
  onChange: (term: string) => void;
  children: React.ReactElement<ChildProps>[];
};

const MIN_IDX = 0;

export function CommandBar({ visible = false, term, onClose, onChange, children }: CommandBarProps) {
  const [activeIdx, setActive] = useState(MIN_IDX);
  const increment = useCallback(() => setActive((x) => Math.min(x + 1, children.length - 1)), [children.length]);
  const decrement = useCallback(() => setActive((x) => Math.max(x - 1, MIN_IDX)), []);

  const handleEnter = useCallback(() => {
    // calls 'execute' prop of the react child.
    // this prop is guaranteed by CommandBarProps
    children[activeIdx]?.props.execute();
    onClose();
  }, [children, activeIdx, onClose]);

  useEffect(() => onChange(''), [onChange, visible]);
  useEffect(() => setActive(MIN_IDX), [children]);

  // inserts 'active' prop to each
  // element props are immutable, therefor they are cloned
  const childrenPlusActive = useMemo(
    () => children.map((item, idx) => React.cloneElement(item, { active: idx === activeIdx })),
    [activeIdx, children]
  );

  return (
    <Card elevation="high" className={classNames(styles.commandBar, visible && styles.visible)}>
      <AutoCompleteInput
        value={term}
        focus={visible}
        className={styles.input}
        onChange={(e) => onChange(e.target.value)}
        onDown={increment}
        onUp={decrement}
        onEnter={handleEnter}
        onEscape={onClose}
        onBlur={onClose}
      />
      {childrenPlusActive}
    </Card>
  );
}
