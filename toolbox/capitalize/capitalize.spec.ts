import { capitalize } from './capitalize';

describe('capitalize()', () => {
  it('should capitalize a single word', () => {
    expect(capitalize('foo')).toEqual('Foo');
  });
});
