import { expect } from 'chai';
import path from 'path';
import { isPathInsideOrEqual } from './hoisted-resolution-bridge';

describe('isPathInsideOrEqual()', () => {
  const base = path.resolve('/base');
  it('should count a descendant as inside', () => {
    expect(isPathInsideOrEqual(path.join(base, 'child'), base)).to.eq(true);
  });
  it('should count a descendant whose name starts with dots as inside', () => {
    expect(isPathInsideOrEqual(path.join(base, '..foo', 'child'), base)).to.eq(true);
  });
  it('should count the parent itself as inside', () => {
    expect(isPathInsideOrEqual(base, base)).to.eq(true);
  });
  it('should count an ancestor as outside', () => {
    expect(isPathInsideOrEqual(path.dirname(base), base)).to.eq(false);
  });
  it('should count a sibling as outside', () => {
    expect(isPathInsideOrEqual(path.join(path.dirname(base), 'sibling'), base)).to.eq(false);
  });
});
