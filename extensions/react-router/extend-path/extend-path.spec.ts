import { expect } from 'chai';

import { extendPath } from './extend-path';

it('should return prefix when path is undefined', () => {
  const res = extendPath('hello/world');
  expect(res).to.equal('hello/world');
});

it('should return prefix when path is empty', () => {
  const res = extendPath('hello/world', '');
  expect(res).to.equal('hello/world');
});

it('should join paths', () => {
  const res = extendPath('hello', 'world');
  expect(res).to.equal('hello/world');
});

it('should not create avoid simple duplicate slashes', () => {
  const res = extendPath('hello//', '//world');
  expect(res).to.equal('hello/world');
});

it('should not create avoid duplicate slashes', () => {
  const res = extendPath('hello//', '//world');
  expect(res).to.equal('hello/world');
});

it('should extend array paths', () => {
  const res = extendPath('hello', ['world', 'darling', '']);
  expect(res).to.deep.equal(['hello/world', 'hello/darling', 'hello']);
});
