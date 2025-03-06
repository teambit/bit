import { queryString } from './query-string';
import { expect } from 'chai';

describe('queryString()', () => {
  it('should serialize an object with {foo: bar} to a query string', () => {
    const str = queryString({
      foo: 'bar',
    });

    expect(str).to.equal('foo=bar');
  });

  it('should serialize an object with multiple entries to a query string', () => {
    const str = queryString({
      foo: 'bar',
      boo: 'app',
    });

    expect(str).to.equal('foo=bar&boo=app');
  });

  it('should stringify a boolean value into a string if exists', () => {
    const str = queryString({
      foo: 'bar',
      boo: false,
    });

    expect(str).to.equal('foo=bar&boo=false');
  });
});
