import React, { useMemo } from 'react';
import classnames from 'classnames';
import styles from './key.module.scss';
import { prettifyKey } from './key-characters';

export type KeySequenceProps = { children?: string } & React.HTMLAttributes<HTMLDivElement>;
export type KeyComboProps = { children?: string } & React.HTMLAttributes<HTMLDivElement>;
export type KeycapProps = { children: string } & React.HTMLAttributes<HTMLElement>;

/** renders a sequence of keys, e.g. `ctrl+K then ctrl+d` */
export function KeySequence({ children, className, ...rest }: KeySequenceProps) {
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

  return (
    <div {...rest} className={classnames(styles.keySequence, className)}>
      {content}
    </div>
  );
}

/** renders a key combination */
export function KeyCombo({ children, className, ...rest }: KeyComboProps) {
  if (!children) return null;

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
  const prettyKey = prettifyKey(children);

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
