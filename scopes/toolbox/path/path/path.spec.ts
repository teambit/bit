import { expect } from 'chai';
import { incrementPathRecursively } from './path';

describe('incrementPathRecursively', () => {
  it('should append _1 when the path is free', () => {
    expect(incrementPathRecursively('bar', ['bar'])).to.equal('bar_1');
  });
  it('should skip numbers that are taken', () => {
    expect(incrementPathRecursively('bar', ['bar', 'bar_1', 'bar_2'])).to.equal('bar_3');
  });
});
