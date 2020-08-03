import React, { useCallback, createRef, useEffect, useState } from 'react';
import classNames from 'classnames';
import { Card } from '@bit/bit.base-ui.surfaces.card';
import styles from './command-bar.module.scss';

export type CommandBarProps = { visible: boolean; onClose: () => void; onSubmit: (command: string) => void };

export function CommandBar({ visible = false, onClose, onSubmit }: CommandBarProps) {
  const inputRef = createRef<HTMLInputElement>();
  const [value, setValue] = useState('');

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Escape':
          return onClose();
        default:
          return undefined;
      }
    },
    [value, onClose]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  useEffect(() => {
    setValue('');
    if (visible) {
      inputRef.current?.focus();
    }
  }, [visible]);

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
          onChange={handleChange}
          className={styles.input}
          ref={inputRef}
          onKeyDown={handleKeyDown}
        />
      </form>
    </Card>
  );
}
