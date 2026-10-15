import { expect } from 'chai';
import { isPlusVersion, resolvePlusVersion } from './plus-version';

const snap = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';

describe('isPlusVersion()', () => {
  it('should be true for "+", "+^" and "+~"', () => {
    expect(isPlusVersion('+')).to.be.true;
    expect(isPlusVersion('+^')).to.be.true;
    expect(isPlusVersion('+~')).to.be.true;
  });
  it('should be false for anything else', () => {
    expect(isPlusVersion(undefined)).to.be.false;
    expect(isPlusVersion('')).to.be.false;
    expect(isPlusVersion('2.0.15')).to.be.false;
    expect(isPlusVersion('^2.0.15')).to.be.false;
    expect(isPlusVersion('+>')).to.be.false;
    expect(isPlusVersion('-')).to.be.false;
  });
});

describe('resolvePlusVersion()', () => {
  it('should return a non-plus version as is', () => {
    expect(resolvePlusVersion('2.0.15', '2.0.21')).to.equal('2.0.15');
    expect(resolvePlusVersion('^1.0.0', '2.0.21')).to.equal('^1.0.0');
  });
  it('should resolve "+" to the exact version', () => {
    expect(resolvePlusVersion('+', '2.0.21')).to.equal('2.0.21');
  });
  it('should resolve "+^" and "+~" to the version with the prefix', () => {
    expect(resolvePlusVersion('+^', '2.0.21')).to.equal('^2.0.21');
    expect(resolvePlusVersion('+~', '2.0.21')).to.equal('~2.0.21');
  });
  it('should keep a pre-release tag with the prefix', () => {
    expect(resolvePlusVersion('+^', '2.0.21-beta.1')).to.equal('^2.0.21-beta.1');
  });
  it('should not add a prefix to a snap, either as a hash or as semver', () => {
    expect(resolvePlusVersion('+^', snap)).to.equal(snap);
    expect(resolvePlusVersion('+~', `0.0.0-${snap}`)).to.equal(`0.0.0-${snap}`);
    expect(resolvePlusVersion('+', snap)).to.equal(snap);
  });
  it('should not add a prefix to a resolved value that is already a range', () => {
    expect(resolvePlusVersion('+^', '^2.0.0')).to.equal('^2.0.0');
    expect(resolvePlusVersion('+^', '*')).to.equal('*');
  });
});
