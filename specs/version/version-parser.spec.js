import { expect } from 'chai';
import versionParser from './version-parser';

describe('versionParser()', () => {
  it('should return latest verion reprenestation', () => {
    const version = versionParser('latest');
    expect(version.latest).to.equal(true);
    expect(version.versionNum).to.equal(null);
  });

  it('should throw invalid version', () => {
    expect(() => {
      versionParser('$1');
    }).to.throw();
  });

  it('should return a concerete version', () => {
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
