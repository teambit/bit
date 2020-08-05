import React, { useCallback, createRef, useEffect, useState, useMemo } from 'react';
import Fuze from 'fuse.js';
import classNames from 'classnames';
import { Card } from '@bit/bit.base-ui.surfaces.card';
import { CommandBarOption } from './command-bar-item';
import { Keybinding } from '../../keyboard-shortcuts/keyboard-shortcuts.ui';
import { Hotkeys } from '../../stage-components/elements/key';
import { CommandId } from '../../commands/commands.ui';
import styles from './command-bar.module.scss';
import { DependencyList } from '../../component/dependencies/dependencies';

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
  getHotkeys: (command: CommandId) => Keybinding | undefined;
};

const MIN_ACTIVE_IDX = 0;

export function CommandBar({ visible = false, onClose, onSubmit, autoComplete, getHotkeys }: CommandBarProps) {
  const inputRef = createRef<HTMLInputElement>();
  const [value, setValue] = useState('');
  const [activeIdx, setActive] = useState(MIN_ACTIVE_IDX);

  useEffect(() => setValue(''), [visible]);
  useEffect(() => {
    if (visible) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputRef.current, visible]);

  const options = useMemo(() => {
    // weird, but legit https://stackoverflow.com/questions/58102182
    setActive(MIN_ACTIVE_IDX);
    return autoComplete(value);
  }, [value, autoComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const handlers = {
        Escape: onClose,
        ArrowDown: () => {
          e.preventDefault();
          setActive((v) => Math.min(v + 1, options.length - 1));
        },
        ArrowUp: () => {
          e.preventDefault();
          return setActive((v) => Math.max(v - 1, MIN_ACTIVE_IDX));
        },
        Enter: () => {
          const result = options[activeIdx]?.item.id as string | undefined;
          if (!result) return undefined; // like vsc
          return onSubmit(result);
        },
      };

      return e.key in handlers ? handlers[e.key]() : undefined;
    },
    [activeIdx, onClose, onSubmit, options]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  return (
    <Card className={classNames(styles.commandBar, visible && styles.visible)}>
      <input
        value={value}
        onBlur={onClose}
        onChange={handleChange}
        className={styles.input}
        ref={inputRef}
        onKeyDown={handleKeyDown}
      />
      {options.map((x, idx) => (
        <CommandBarOption key={x.item.id} onClick={() => onSubmit(x.item.id)} active={idx === activeIdx}>
          <Hotkeys className={styles.commandKeys}>{getHotkeys(x.item.id)}</Hotkeys>
          <div>{x.item.name}</div>
          <div className={styles.commandDescription}>{x.item.description}</div>
        </CommandBarOption>
      ))}
    </Card>
  );
}
