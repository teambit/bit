import React from 'react';
import classNames from 'classnames';
import styles from './key.module.scss';
import { keySymbols } from './key-characters';

export type KbdProps = { children: string } & React.HTMLAttributes<HTMLElement>;

type HotkeysProps = { children: string } & React.HTMLAttributes<HTMLDivElement>;
export function Hotkeys({ children, className, ...rest }: HotkeysProps) {
  // TODO - support all separators - sequence (' '), AND ('+'), OR (string[])
  const split = children.split('+').map((x) => x.trim());

  return (
    <div {...rest} className={classNames(className, styles.hotkeys)}>
      {split.map((x, idx) => (
        <Key key={idx}>{x}</Key>
      ))}
    </div>
  );
}

export function Key({ className, children, ...rest }: KbdProps) {
  const prettyKey = children in keySymbols ? keySymbols[children] : children;

  return (
    <kbd {...rest} className={classNames(className, styles.kbd)}>
      {prettyKey}
    </kbd>
  );
}
