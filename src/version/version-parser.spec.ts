import { expect } from 'chai';
import versionParser from '../version/version-parser';

describe('versionParser()', () => {
  it('should return latest version representation', () => {
    const version = versionParser('latest');
    expect(version.latest).to.equal(true);
    expect(version.versionNum).to.equal(null);
  });

  it('should throw invalid version', () => {
    const version = v => versionParser(v);
    expect(() => {
      version('$1');
      // TODO: expect a specific error
    }).to.throw();
  });

  it('should return a concrete version', () => {
    const version = versionParser('0.0.1');
    expect(version.latest).to.equal(false);
    expect(version.versionNum).to.equal('0.0.1');
  });

  it('should return a latest tested version', () => {
    const version = versionParser('*0.0.1');
    expect(version.latest).to.equal(true);
    expect(version.versionNum).to.equal('0.0.1');
  });

  it('should return a latest tested version with double digits', () => {
    const version = versionParser('*0.0.11');
    expect(version.latest).to.equal(true);
    expect(version.versionNum).to.equal('0.0.11');
  });

  it('should parse given version as latest', () => {
    const version = versionParser('latest');
    expect(version.versionNum).to.equal(null);
    expect(version.latest).to.equal(true);
  });
});
