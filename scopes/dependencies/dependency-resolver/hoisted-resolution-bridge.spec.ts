import { expect } from 'chai';
import path from 'path';
import { isPathInsideOrEqual, parseRecordedVirtualStoreDir } from './hoisted-resolution-bridge';

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

describe('parseRecordedVirtualStoreDir()', () => {
  it('should read the JSON manifest current pnpm writes', () => {
    const manifest = JSON.stringify({ hoistedDependencies: {}, virtualStoreDir: '../../store/v11/links' }, null, 2);
    expect(parseRecordedVirtualStoreDir(manifest)).to.eq('../../store/v11/links');
  });
  it('should read a block-YAML manifest from an older pnpm', () => {
    expect(parseRecordedVirtualStoreDir('layoutVersion: 5\nvirtualStoreDir: .pnpm\n')).to.eq('.pnpm');
  });
  it('should not confuse virtualStoreDirMaxLength for the store dir', () => {
    expect(parseRecordedVirtualStoreDir('virtualStoreDirMaxLength: 120\n')).to.eq(undefined);
  });
  it('should return undefined when the manifest records no store dir', () => {
    expect(parseRecordedVirtualStoreDir(JSON.stringify({ layoutVersion: 5 }))).to.eq(undefined);
  });
});
