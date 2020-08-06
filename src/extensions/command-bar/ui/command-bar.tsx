import React, { useCallback, createRef, useEffect, useState, useMemo } from 'react';
import classNames from 'classnames';
import { Card } from '@teambit/base-ui-temp.surfaces.card';
import { Keybinding } from '../../keyboard-shortcuts/keyboard-shortcuts.ui';
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

const MIN_ACTIVE_IDX = 0;

export function CommandBar({ visible = false, term, onClose, onChange, children }: CommandBarProps) {
  const inputRef = createRef<HTMLInputElement>();
  const [activeIdx, setActive] = useState(MIN_ACTIVE_IDX);

  // reset input when changing visible
  useEffect(() => onChange(''), [onChange, visible]);
  // focus when becoming visible
  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [inputRef, visible]);
  // reset when items change
  useEffect(() => setActive(MIN_ACTIVE_IDX), [children]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const handlers = {
        Escape: onClose,
        ArrowDown: () => {
          e.preventDefault();
          setActive((v) => Math.min(v + 1, children.length - 1));
        },
        ArrowUp: () => {
          e.preventDefault();
          return setActive((v) => Math.max(v - 1, MIN_ACTIVE_IDX));
        },
        Enter: () => {
          // calls 'execute' prop of the react child. yes, this syntnax works
          children[activeIdx]?.props.execute();
          onClose();
        },
      };

      return e.key in handlers ? handlers[e.key]() : undefined;
    },
    [activeIdx, children, onClose]
  );

  // inserts 'active' prop to each
  // element props are immutable, therefor they are cloned
  const childrenPlusActive = useMemo(
    () => children.map((item, idx) => React.cloneElement(item, { active: idx === activeIdx })),
    [activeIdx, children]
  );

  return (
    <Card elevation="high" className={classNames(styles.commandBar, visible && styles.visible)}>
      <input
        value={term}
        onBlur={onClose}
        onChange={(e) => onChange(e.target.value)}
        className={styles.input}
        ref={inputRef}
        onKeyDown={handleKeyDown}
      />
      {childrenPlusActive}
    </Card>
  );
}
