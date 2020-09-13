import React, { useMemo } from 'react';
import classnames from 'classnames';
import styles from './key.module.scss';
import { keySymbols } from './key-characters';

export type KeycapProps = { children: string } & React.HTMLAttributes<HTMLElement>;
export type KeyShortcutProps = { children?: string } & React.HTMLAttributes<HTMLDivElement>;

export function KeySequence({ children, className }: { children?: string; className: string }) {
  if (!children) return null;

  const content = useMemo(() => {
    const split = children
      .split(' ')
      .map((x) => x.trim())
      .filter((x) => !!x);

    const mapped = split.map((combo, idx) => <KeyCombo key={idx}>{combo}</KeyCombo>);
    const withThens = insertBetween(mapped, (idx) => <Then key={`then-sep_${idx}`} />);

    return withThens;
  }, [children]);

  return <div className={classnames(styles.keySequence, className)}>{content}</div>;
}

/** renders a key combination */
export function KeyCombo({ children, className, ...rest }: KeyShortcutProps) {
  if (!children) return null;

  // TODO - support all separators - sequence (' '), AND ('+'), OR (string[])
  const split = children.split('+').map((x) => x.trim());

  return (
    <div {...rest} className={classnames(className, styles.keyCombo)}>
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
    <kbd {...rest} className={classnames(className, styles.keycap)}>
      {prettyKey}
    </kbd>
  );
}

function insertBetween<T>(arr: T[], toInsert: (idx: number) => T) {
  const res = [] as T[];

  arr.forEach((item, idx) => {
    res.push(item);
    res.push(toInsert(idx));
  });

  res.pop(); // remove trailing item

  return res;
}

function Then() {
  return <span className={styles.thenSep}>then</span>;
}
