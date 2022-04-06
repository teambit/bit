import React from 'react';
import { CommandBar } from './command-bar';

function _search() {
  return [
    { id: '1', children: 'hello', handler: () => {} },
    { id: '2', children: 'world', handler: () => {} },
    { id: '3', children: 'what', handler: () => {} },
    { id: '4', children: 'is', handler: () => {} },
    { id: '5', children: 'up', handler: () => {} },
  ];
}

export function Preview() {
  return <CommandBar style={{ fontFamily: 'sans-serif' }} searcher={_search} visible />;
}
