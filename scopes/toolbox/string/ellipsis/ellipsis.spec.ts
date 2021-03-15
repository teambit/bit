import { ellipsis } from './ellipsis';

it('should not ellipsis', () => {
  expect(ellipsis('abc', 3)).toEqual('abc');
});

it('should ellipsis', () => {
  expect(ellipsis('abcde', 3)).toEqual('abc...');
});
