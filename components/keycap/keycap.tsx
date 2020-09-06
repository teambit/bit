import React from 'react';
import classNames from 'classnames';
import styles from './key.module.scss';
import { keySymbols } from './key-characters';

export type KeycapProps = { children: string } & React.HTMLAttributes<HTMLElement>;
export type KeySequenceProps = { children?: string } & React.HTMLAttributes<HTMLDivElement>;

/** renders a key combination */
export function KeySequence({ children, className, ...rest }: KeySequenceProps) {
  if (!children) return null;

  // TODO - support all separators - sequence (' '), AND ('+'), OR (string[])
  const split = children.split('+').map((x) => x.trim());

  return (
    <div {...rest} className={classNames(className, styles.hotkeys)}>
      {split.map((x, idx) => (
        <Keycap key={idx}>{x}</Keycap>
      ))}
    </div>
  );
}

/** renders children as a physical key */
export function Keycap({ className, children, ...rest }: KeycapProps) {
  const prettyKey = children in keySymbols ? keySymbols[children] : children;

  return (
    <kbd {...rest} className={classNames(className, styles.kbd)}>
      {prettyKey}
    </kbd>
  );
}
