import { expect } from 'chai';
import leftPad from './pad-left';

describe('#leftPad()', () => {
  it('should pad string `foo` to a total char size of 5', () => {
    expect(leftPad('foo', 5)).to.equal('  foo');
  });

  it('should not pad string `foobar` any char as 6 is the original str length', () => {
    expect(leftPad('foobar', 6)).to.equal('foobar');
  });

  it('should pad string `1` with one 0', () => {
    expect(leftPad('17', 5, '0')).to.equal('00017');
  });
});
