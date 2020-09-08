import React from 'react';
import classNames from 'classnames';
import styles from './key.module.scss';
import { keySymbols } from './key-characters';

export type KeycapProps = { children: string } & React.HTMLAttributes<HTMLElement>;
export type KeyShortcutProps = { children?: string } & React.HTMLAttributes<HTMLDivElement>;

/** renders a key combination */
export function KeyShortcut({ children, className, ...rest }: KeyShortcutProps) {
  if (!children) return null;

  // TODO - support all separators - sequence (' '), AND ('+'), OR (string[])
  const split = children.split('+').map((x) => x.trim());

  return (
    <div {...rest} className={classNames(className, styles.keyShortcut)}>
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
    <kbd {...rest} className={classNames(className, styles.keycap)}>
      {prettyKey}
    </kbd>
  );
}

// import React from 'react';
// import classNames from 'classnames';
// import { Keybinding } from '@teambit/command-bar/command-bar.ui.runtime';
// import { keySymbols } from './key-characters';
// import styles from './key.module.scss';

// export type KeycapProps = { children: string } & React.HTMLAttributes<HTMLElement>;
// export type KeyShortcutProps = { children?: Keybinding } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;
// export type KeySequencesProps = { children: string } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;

// export function KeyShortcut({ children, className, ...rest }: KeyShortcutProps) {
//   if (!children) return null;

//   if (Array.isArray(children)) {
//     return (
//       <div {...rest} className={classNames(className, styles.keyShortcut)}>
//         {jsxJoin<React.ReactNode>(
//           children.map((keybinding) => <KeySequences key={keybinding}>{keybinding}</KeySequences>),
//           ' or '
//         )}
//       </div>
//     );
//   }

//   return (
//     <KeySequences {...rest} className={className}>
//       {children}
//     </KeySequences>
//   );
// }

// /** renders a key combination */
// function KeySequences({ children, ...rest }: KeySequencesProps) {
//   if (!children) return null;

//   // operator ' ' -> keys should be pressed in a sequence
//   const sequences = children.split(' ').map((x) => x.trim());
//   if (sequences.length === 0) {
//     return <KeySequence {...rest}>{sequences[0]}</KeySequence>;
//   }

//   return (
//     <div {...rest} className={classNames(rest.className, styles.keySequences)}>
//       {
//         sequences.map((x, idx) =>
//         <>
//           <KeySequence key={2 * idx}>{x}</KeySequence>)
//           <span key={2 * idx + 1}>then</span>
//           </>
//       )}
//     </div>
//   );
// }

// function KeySequence({ children, className, ...rest }: KeySequencesProps) {
//   // operator '+' -> keys should be held together
//   const split = children.split('+').map((x) => x.trim());

//   return (
//     <div {...rest} className={classNames(className, styles.keySequence)}>
//       {split.map((x, idx) => (
//         <Keycap key={idx}>{x}</Keycap>
//       ))}
//     </div>
//   );
// }

// /** renders children as a physical key */
// export function Keycap({ className, children, ...rest }: KeycapProps) {
//   const prettyKey = children in keySymbols ? keySymbols[children] : children;

//   return (
//     <kbd {...rest} className={classNames(className, styles.keycap)}>
//       {prettyKey}
//     </kbd>
//   );
// }

// function jsxJoin<T>(arr: T[], sep: T) {
//   const res = [] as T[];
//   arr.forEach((x) => res.push(x, sep));
//   res.pop(); // remove separator at end
//   return res;
// }
