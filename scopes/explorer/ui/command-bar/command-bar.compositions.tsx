import React from 'react';
import { CommandBar } from './command-bar';

function _search() {
  return [
    { id: '1', displayName: 'hello', handler: () => {} },
    { id: '2', displayName: 'world', handler: () => {} },
    { id: '3', displayName: 'what', handler: () => {} },
    { id: '4', displayName: 'is', handler: () => {} },
    { id: '5', displayName: 'up', handler: () => {} },
  ];
}

export function Preview() {
  return <CommandBar searcher={_search} visible />;
}
