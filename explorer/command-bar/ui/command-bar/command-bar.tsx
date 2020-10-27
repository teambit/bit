import React, { useCallback, useEffect, useState, useMemo } from 'react';
import classNames from 'classnames';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import type { CommandBarUI } from '../../command-bar.ui.runtime';
import { CommanderSearchResult } from '../../types';
import { AutoCompleteInput } from '../autocomplete-input';
import { CommandBarItem } from '../command-bar-item';
import styles from './command-bar.module.scss';

export type CommandBarProps = {
  search: (term: string, limit?: number) => CommanderSearchResult[];
  commander: CommandBarUI;
} & CardProps;

const MIN_IDX = 0;

export function CommandBar({ search, commander, elevation = 'high', className, ...rest }: CommandBarProps) {
  const [term, setTerm] = useState('');
  const options = useMemo(() => search(term), [term, search]);
  const [activeIdx, setActive] = useState(MIN_IDX);
  const increment = useCallback(() => setActive((x) => Math.min(x + 1, options.length - 1)), [options.length]);
  const decrement = useCallback(() => setActive((x) => Math.max(x - 1, MIN_IDX)), []);
  const [visible, setVisibility] = useState(false);

  commander.setVisibility = setVisibility;

  const handleEnter = useCallback(() => {
    setVisibility(false);
    options[activeIdx]?.handler();
  }, [options, activeIdx]);

  useEffect(() => setTerm(''), [visible]);
  useEffect(() => setActive(MIN_IDX), [options]);

  return (
    <Card
      {...rest}
      elevation={elevation}
      className={classNames(className, styles.commandBar, visible && styles.visible)}
    >
      <AutoCompleteInput
        value={term}
        focus={visible}
        className={styles.input}
        placeholder="Search anything or type > to only search commands"
        onChange={(e) => setTerm(e.target.value)}
        onDown={increment}
        onUp={decrement}
        onEnter={handleEnter}
        onEscape={() => setVisibility(false)}
        onBlur={() => setVisibility(false)}
      />
      <div className={styles.results}>
        {options.map((x, idx) => (
          <CommandBarItem
            key={idx} // use index instead of id to avoid duplicate keys
            entry={x}
            active={idx === activeIdx}
            // mouseDown happens before blur, which closes the command bar
            onMouseDown={x.handler}
          />
        ))}
      </div>
    </Card>
  );
}
