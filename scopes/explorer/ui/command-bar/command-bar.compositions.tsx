import React from 'react';
import { CommandBar } from './command-bar';

function search() {
  return [
    { id: '1', children: 'hello', action: () => {} },
    { id: '2', children: 'world', action: () => {} },
    { id: '3', children: 'what', action: () => {} },
    { id: '4', children: 'is', action: () => {} },
    { id: '5', children: 'up', action: () => {} },
  ];
}

export function Preview() {
  return <CommandBar style={{ fontFamily: 'sans-serif' }} searcher={search} visible />;
}
