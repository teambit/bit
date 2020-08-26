import { capitalize } from './capitalize';

describe('capitalize()', () => {
  it('should capitalize a single word', () => {
    // @ts-ignore
    // eslint-disable-next-line no-undef
    expect(capitalize('foo')).toEqual('Foo');
  });
});
