import React, { useCallback, createRef, useEffect, useState, useMemo } from 'react';
import Fuze from 'fuse.js';
import classNames from 'classnames';
import { Card } from '@bit/bit.base-ui.surfaces.card';
import styles from './command-bar.module.scss';
import { CommandBarOption } from './command-bar-item';
import { Keybinding } from '../../keyboard-shortcuts/keyboard-shortcuts.ui';
import { Hotkeys } from '../../stage-components/elements/key';

export type CommandObj = {
  id: string;
  key?: Keybinding;
  name: string;
  description?: string;
};

export type CommandBarProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (command: string) => void;
  autoComplete: (filter: string, limit?: number) => Fuze.FuseResult<CommandObj>[];
};

export function CommandBar({ visible = false, onClose, onSubmit, autoComplete }: CommandBarProps) {
  const inputRef = createRef<HTMLInputElement>();
  const [value, setValue] = useState('');

  useEffect(() => setValue(''), [visible]);
  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputRef.current, visible]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Escape':
          return onClose();
        default:
          return undefined;
      }
    },
    [onClose]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  const options = useMemo(() => {
    return autoComplete(value);
  }, [value, autoComplete]);

  return (
    <Card className={classNames(styles.commandBar, visible && styles.visible)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <input
          value={value}
          onBlur={onClose}
          onChange={handleChange}
          className={styles.input}
          ref={inputRef}
          onKeyDown={handleKeyDown}
        />
      </form>
      {options.map((x) => (
        <CommandBarOption key={x.item.id} onClick={() => onSubmit(x.item.id)}>
          {x.item.key && <Hotkeys className={styles.commandKeys}>{x.item.key}</Hotkeys>}
          <div>{x.item.name}</div>
          <div className={styles.commandDescription}>{x.item.description}</div>
        </CommandBarOption>
      ))}
    </Card>
  );
}
