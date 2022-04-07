import React, { useCallback, useEffect, useState, useMemo } from 'react';
import classNames from 'classnames';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { SearchResult } from '../search-result';
import { AutoCompleteInput } from '../autocomplete-input';
import { CommandBarItem } from '../command-bar-item';
import styles from './command-bar.module.scss';

export type CommandBarProps = {
  searcher: (term: string, limit?: number) => SearchResult[];
  visible?: boolean;
  onVisibilityChange?: (nextVisible: boolean) => void;
  placeholder?: string;
} & CardProps;

export function CommandBar({
  elevation = 'high',
  className,
  visible = true,
  searcher,
  onVisibilityChange: setVisibility,
  placeholder = 'Search anything',
  ...rest
}: CommandBarProps) {
  const [term, setTerm] = useState('');
  useEffect(() => setTerm(''), [visible]); // reset on visibility change
  const results = useMemo(() => searcher(term), [term, searcher]);

  const idxNav = use1dNav(results.length);
  useEffect(() => idxNav.reset(), [results]); // reset on results change

  const handleEnter = () => {
    setVisibility?.(false);

    const current = results[idxNav.activeIdx];
    current?.action();
  };

  const keyHandlers = {
    ArrowDown: idxNav.increment,
    ArrowUp: idxNav.decrement,
    Enter: handleEnter,
    Escape: () => setVisibility?.(false),
  };

  return (
    <Card
      {...rest}
      elevation={elevation}
      className={classNames(className, styles.commandBar, visible && styles.visible)}
    >
      <AutoCompleteInput
        value={term}
        focus={visible}
        keyHandlers={keyHandlers}
        className={styles.input}
        placeholder={placeholder}
        onChange={(e) => setTerm(e.target.value)}
        onBlur={() => setVisibility?.(false)}
      />
      <div className={styles.results}>
        {results.map(({ action, id, ...result }, idx) => (
          <CommandBarItem
            key={id}
            active={idx === idxNav.activeIdx}
            // mouseDown happens before blur, which closes the command bar
            onMouseDown={() => action()}
            {...result}
          />
        ))}
      </div>
    </Card>
  );
}

const MIN_IDX = 0;
function use1dNav(length: number, startIdx = 0) {
  const [activeIdx, setActive] = useState(startIdx);

  const increment = useCallback(() => setActive((x) => Math.min(x + 1, length - 1)), [length]);
  const decrement = useCallback(() => setActive((x) => Math.max(x - 1, MIN_IDX)), []);
  const reset = useCallback(() => setActive(startIdx), [startIdx]);

  return {
    activeIdx,
    increment,
    decrement,
    reset,
  };
}
