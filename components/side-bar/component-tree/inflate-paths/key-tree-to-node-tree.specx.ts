import { expect } from 'chai';

import { keyTreeToNodeTree } from './key-tree-to-node-tree';

it('should handle empty tree', () => {
  const result = keyTreeToNodeTree('/', {});

  expect(result).to.deep.equal({
    id: '/',
    children: [],
  });
});

it('should handle undefined tree', () => {
  const result = keyTreeToNodeTree('/');

  expect(result).to.deep.equal({
    id: '/',
    children: undefined,
  });
});

it('should handle leaf nodes', () => {
  const result = keyTreeToNodeTree('/', { hello: undefined });

  expect(result).to.deep.equal({
    id: '/',
    children: [
      {
        id: 'hello',
        children: undefined,
      },
    ],
  });
});

it('should handle inner nodes', () => {
  const result = keyTreeToNodeTree('/', { 'hello/': {} });

  expect(result).to.deep.equal({
    id: '/',
    children: [
      {
        id: 'hello/',
        children: [],
      },
    ],
  });
});

it('should handle nested nodes', () => {
  const result = keyTreeToNodeTree('/', { 'hello/': { one: undefined, two: undefined } });

  expect(result).to.deep.equal({
    id: '/',
    children: [
      {
        id: 'hello/',
        children: [
          {
            id: 'one',
            children: undefined,
          },
          {
            id: 'two',
            children: undefined,
          },
        ],
      },
    ],
  });
});

it('should handle nested nodes', () => {
  const result = keyTreeToNodeTree('/', { 'hello/': { 'hello/one': undefined, 'hello/two': undefined } });

  expect(result).to.deep.equal({
    id: '/',
    children: [
      {
        id: 'hello/',
        children: [
          {
            id: 'hello/one',
            children: undefined,
          },
          {
            id: 'hello/two',
            children: undefined,
          },
        ],
      },
    ],
  });
});

it('should leaf and inner nodes with the same name', () => {
  const result = keyTreeToNodeTree('/', { 'hello/': {}, hello: undefined });

  expect(result).to.deep.equal({
    id: '/',
    children: [
      {
        id: 'hello/',
        children: [],
      },
      {
        id: 'hello',
        children: undefined,
      },
    ],
  });
});

it('should sort inner nodes first and alphabetically', () => {
  const result = keyTreeToNodeTree('/', { 'b/': {}, c: undefined, 'd/': {}, a: undefined });

  expect(result).to.deep.equal({
    id: '/',
    children: [
      {
        id: 'b/',
        children: [],
      },
      {
        id: 'd/',
        children: [],
      },
      {
        id: 'a',
        children: undefined,
      },
      {
        id: 'c',
        children: undefined,
      },
    ],
  });
});
