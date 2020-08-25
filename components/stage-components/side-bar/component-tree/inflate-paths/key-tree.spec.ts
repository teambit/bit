import { expect } from 'chai';

import { buildKeyTree } from './key-tree';

it('should return an empty node for 0 paths', () => {
  const res = buildKeyTree([]);
  expect(res).to.be.empty;
});

it('should return a leaf node for a single filepath', () => {
  const res = buildKeyTree(['item']);
  expect(res).to.deep.equal({ item: undefined });
});

it('should return a inner node for a filepath with folders', () => {
  const res = buildKeyTree(['container/item']);
  expect(res).to.deep.equal({
    'container/': {
      'container/item': undefined,
    },
  });
});

it('should make common ancestor when two nodes have the same sub path', () => {
  const res = buildKeyTree(['container/sub/a', 'container/sub/b']);
  expect(res).to.deep.equal({
    'container/': {
      'container/sub/': {
        'container/sub/a': undefined,
        'container/sub/b': undefined,
      },
    },
  });
});

it('should make a node for empty folders', () => {
  const res = buildKeyTree(['container/sub/']);

  expect(res).to.deep.equal({
    'container/': {
      'container/sub/': {},
    },
  });
});

it('should make two nodes, when receiving a folder and a file of the same name', () => {
  const res = buildKeyTree(['container/', 'container']);
  expect(res).to.deep.equal({
    'container/': {},
    container: undefined,
  });
});
