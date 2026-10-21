import React from 'react';
import { DiffViewer } from './diff-viewer';

const wrap: React.CSSProperties = { padding: 24, maxWidth: 1100, fontFamily: 'sans-serif' };

// --- TypeScript sample (modified) ---

const tsOld = `import { useState } from 'react';

export type CounterProps = {
  initial: number;
};

export function Counter({ initial }: CounterProps) {
  const [count, setCount] = useState(initial);
  // increment by one
  const inc = () => setCount(count + 1);
  return <button onClick={inc}>{count}</button>;
}
`;

const tsNew = `import { useCallback, useState } from 'react';

export type CounterProps = {
  initial: number;
  step?: number;
};

export function Counter({ initial, step = 1 }: CounterProps) {
  const [count, setCount] = useState(initial);
  // increment by the configured step
  const inc = useCallback(() => setCount((c) => c + step), [step]);
  return <button onClick={inc}>count is {count}</button>;
}
`;

export const TypeScriptDiffSplit = () => (
  <div style={wrap}>
    <DiffViewer fileName="components/counter/counter.tsx" oldContent={tsOld} newContent={tsNew} defaultView="split" />
  </div>
);

export const TypeScriptDiffUnified = () => (
  <div style={wrap}>
    <DiffViewer fileName="components/counter/counter.tsx" oldContent={tsOld} newContent={tsNew} defaultView="unified" />
  </div>
);

// --- SCSS sample (intra-line + multi-language) ---

const scssOld = `.card {
  border-radius: 8px;
  padding: 12px;
  color: #333;
}
`;
const scssNew = `.card {
  border-radius: 10px;
  padding: 16px 12px;
  color: var(--on-surface-color, #2b2b2b);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
`;

export const ScssDiff = () => (
  <div style={wrap}>
    <DiffViewer
      fileName="components/card/card.module.scss"
      oldContent={scssOld}
      newContent={scssNew}
      defaultView="split"
    />
  </div>
);

// --- Python sample ---

const pyOld = `def greet(name):
    print("Hello, " + name)


def main():
    greet("world")
`;
const pyNew = `def greet(name: str) -> None:
    print(f"Hello, {name}!")


def main() -> None:
    for who in ["world", "bit"]:
        greet(who)
`;

export const PythonDiff = () => (
  <div style={wrap}>
    <DiffViewer fileName="scripts/greet.py" oldContent={pyOld} newContent={pyNew} defaultView="unified" />
  </div>
);

// --- New file ---

export const NewFile = () => (
  <div style={wrap}>
    <DiffViewer
      fileName="components/badge/index.ts"
      oldContent=""
      newContent={"export { Badge } from './badge';\nexport type { BadgeProps } from './badge';\n"}
      status="new"
    />
  </div>
);

// --- Large diff (virtualization + expand context) ---

function makeLargeOld(): string {
  const lines: string[] = [];
  for (let i = 1; i <= 600; i++) lines.push(`export const value${i} = ${i};`);
  return lines.join('\n');
}
function makeLargeNew(): string {
  const lines: string[] = [];
  for (let i = 1; i <= 600; i++) {
    if (i === 120) lines.push(`export const value${i} = ${i} * 2; // doubled`);
    else if (i === 400) lines.push(`export const value${i} = ${i} + 100;`);
    else lines.push(`export const value${i} = ${i};`);
  }
  return lines.join('\n');
}

export const LargeVirtualizedDiff = () => (
  <div style={wrap}>
    <DiffViewer
      fileName="generated/values.ts"
      oldContent={makeLargeOld()}
      newContent={makeLargeNew()}
      defaultView="unified"
      maxHeight={500}
    />
  </div>
);

// --- Annotated diff (gutter badges, under-line widget, highlighted range) ---

const reviewOld = `export function total(items: Item[]) {
  let sum = 0;
  for (const item of items) {
    sum += item.price;
  }
  return sum;
}
`;

const reviewNew = `export function total(items: Item[]) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
`;

const avatar = (initial: string, color: string) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 16,
      height: 16,
      borderRadius: 8,
      background: color,
      color: '#fff',
      fontSize: 9,
      fontWeight: 700,
      fontFamily: 'sans-serif',
    }}
  >
    {initial}
  </span>
);

const commentCard = (author: string, body: string) => (
  <div style={{ padding: '10px 14px', fontFamily: 'sans-serif', fontSize: 13, lineHeight: 1.5 }}>
    <strong style={{ fontSize: 12 }}>{author}</strong>
    <div style={{ color: '#4a4a4a' }}>{body}</div>
  </div>
);

export const AnnotatedDiff = () => (
  <div style={wrap}>
    <DiffViewer
      fileName="src/cart/total.ts"
      oldContent={reviewOld}
      newContent={reviewNew}
      defaultView="unified"
      onLineAction={(context) => {
        // eslint-disable-next-line no-console
        console.log('line action', context);
      }}
      annotations={[
        { id: 'a', line: 2, gutter: avatar('R', '#6c5ce7') },
        {
          id: 'a',
          line: 2,
          widget: commentCard('rani', 'reduce reads well here — does quantity always exist on Item?'),
        },
        { id: 'b', line: 3, side: 'old', gutter: avatar('J', '#37b26c') },
      ]}
    />
  </div>
);

export const AnnotatedDiffWithActiveRange = () => (
  <div style={wrap}>
    <DiffViewer
      fileName="src/cart/total.ts"
      oldContent={reviewOld}
      newContent={reviewNew}
      defaultView="split"
      onLineAction={() => {}}
      annotations={[
        {
          id: 'range',
          line: 2,
          side: 'old',
          range: { start: 2, end: 6 },
          active: true,
          gutter: avatar('J', '#37b26c'),
        },
      ]}
    />
  </div>
);
