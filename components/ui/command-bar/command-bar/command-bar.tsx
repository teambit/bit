import React, { useEffect, ComponentType } from 'react';
import classNames from 'classnames';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import usePrevious from '@react-hook/previous';
import useOptionalState from 'use-optionally-controlled-state';
import { use1dNav, useKey1dNav, Nav1D } from '@teambit/base-react.hooks.use-1d-nav';

import { SearchResult } from '../search-result';
import { AutoCompleteInput } from '../autocomplete-input';
import { CommandBarItem } from '../command-bar-item';
import styles from './command-bar.module.scss';


export type ResultsComponentProps<T = SearchResult[], Data = any> = {
  items: T;
  data?: Data,
  activeIndex: number;
};

export type CommandBarProps<T = SearchResult[]> = {
  items: T;
  loading?: boolean;
  visible?: boolean;
  data?: any,
  onVisibilityChange?: (nextVisible: boolean) => void;
  placeholder?: string;
  ResultsComponent?: ComponentType<ResultsComponentProps>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  autofocus?: boolean;
} & Omit<CardProps, 'defaultValue' | 'onChange'>;

export function CommandBar({
  elevation,
  className,
  visible = true,
  items,
  loading,
  data,
  onVisibilityChange: setVisibility,
  placeholder = 'Search anything',
  value,
  defaultValue = '',
  onChange,
  onKeyDown,
  autofocus,
  ResultsComponent = DefaultResultComponent,
  ...rest
}: CommandBarProps) {
  const [term = '', setTerm] = useOptionalState({ controlledValue: value, initialValue: defaultValue, onChange });
  useEffect(() => setTerm(defaultValue), [visible]); // reset on visibility change

  const idxNav = use1dNav(items.length);
  useAutoReset(items, idxNav);

  const handleEnter = () => {
    setVisibility?.(false);

    const current = items[idxNav.activeIdx];
    current?.action();
  };

  const handleKeydown = useKey1dNav(onKeyDown, idxNav, 'vertical', {
    Enter: handleEnter,
    Escape: () => setVisibility?.(false),
  });

  return (
    <Card
      {...rest}
      elevation={elevation}
      className={classNames(className, styles.commandBar, visible && styles.visible, !elevation && styles.shadow)}
    >
      <AutoCompleteInput
        value={term}
        focus={autofocus ? visible : undefined}
        autoFocus={autofocus}
        onKeyDown={handleKeydown}
        className={styles.input}
        placeholder={placeholder}
        onChange={(e) => setTerm(e.target.value)}
        onBlur={() => setVisibility?.(false)}
      />
      <div className={classNames(styles.results, loading && styles.loading)}>
        <ResultsComponent data={data} items={items} activeIndex={idxNav.activeIdx} />
      </div>
    </Card>
  );
}

export function DefaultResultComponent({ items, activeIndex }: ResultsComponentProps) {
  return (
    <>
      {items.map(({ action, id, ...result }, idx) => (
        <CommandBarItem
          key={id}
          active={idx === activeIndex}
          // execute action before blur, which closes the command bar
          onMouseDown={() => action()}
          {...result}
        />
      ))}
    </>
  );
}

function useAutoReset(items: SearchResult[], idxNav: Nav1D) {
  const currentIdx = idxNav.activeIdx;
  const previousIdx = usePrevious(currentIdx);
  const current = items[currentIdx];
  const previous = usePrevious(current);
  const previousExists = !!previous?.id;

  const didIndexMove = currentIdx !== previousIdx;
  const newItemLocation =
    !didIndexMove && previousExists ? items.findIndex((item) => item.id === previous?.id) : undefined;
  const { reset } = idxNav;

  useEffect(() => {
    if (newItemLocation === undefined) return;
    if (newItemLocation === -1) {
      reset();
      return;
    }

    reset(newItemLocation);
  }, [newItemLocation]);
}
