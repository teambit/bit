import { expect } from 'chai';
import versionParser from '../../src/version/version-parser';

describe('versionParser()', () => {
  it('should return latest version representation', () => {
    const version = versionParser('latest');
    expect(version.latest).to.equal(true);
    expect(version.versionNum).to.equal(null);
  });

  it('should throw invalid version', () => {
    expect(() => {
      versionParser('$1');
    }).to.throw();
  });

  it('should return a concrete version', () => {
    const version = versionParser('1');
    expect(version.latest).to.equal(false);
    expect(version.versionNum).to.equal(1);
  });

  it('should return a latest tested version', () => {
    const version = versionParser('*1');
    expect(version.latest).to.equal(true);
    expect(version.versionNum).to.equal(1);
  });

  it('should return a latest tested version with double digits', () => {
    const version = versionParser('*11');
    expect(version.latest).to.equal(true);
    expect(version.versionNum).to.equal(11);
  });
});
