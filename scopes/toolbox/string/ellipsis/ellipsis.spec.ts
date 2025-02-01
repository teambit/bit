import { ellipsis } from './ellipsis';
import { expect } from 'chai';

it('should not ellipsis', () => {
  expect(ellipsis('abc', 3)).to.equal('abc');
});

it('should ellipsis', () => {
  expect(ellipsis('abcde', 3)).to.equal('abc...');
});
