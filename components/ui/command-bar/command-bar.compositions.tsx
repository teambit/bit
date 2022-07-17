import React, { useState } from 'react';
import { CommandBar } from './command-bar';
import { useSearcher } from './command-bar/use-searcher';

let run = 0;

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 1000));
}

async function delayedSearch(term: string, limit: number) {
  await delay();

  return search(term, limit);
}

async function search(term: string, limit: number) {
  const items = term
    .slice(0, limit)
    .split('')
    .map((char, idx) => {
      const text = char + Math.round(Math.random() * 100).toString();

      return {
        // eslint-disable-next-line no-plusplus
        id: `${++run}_${idx}`,
        children: text,
        action: () => {
          // console.log('[cmd-bar] action:', text);
        },
      };
    });

  return {
    items,
  };
}

export function Preview() {
  const results = useSearcher(search);

  return <CommandBar style={{ fontFamily: 'sans-serif', margin: 40, fontSize: 20 }} {...results} visible />;
}

export function AsyncSearch() {
  const results = useSearcher(delayedSearch);

  return <CommandBar style={{ fontFamily: 'sans-serif', margin: 40, fontSize: 20 }} {...results} visible />;
}

export function MixedResults() {
  const [value, setValue] = useState('');

  const results1 = useSearcher(search, { value });
  const results2 = useSearcher(delayedSearch, { value });

  return (
    <CommandBar
      style={{ fontFamily: 'sans-serif', margin: 40, fontSize: 20 }}
      items={[...results1.items, ...results2.items]}
      loading={results1.loading || results2.loading}
      value={value}
      onChange={setValue}
      visible
    />
  );
}
