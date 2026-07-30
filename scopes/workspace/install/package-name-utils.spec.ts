import { expect } from 'chai';
import { extractPackageName, isValidPackageName } from './package-name-utils';

describe('isValidPackageName', () => {
  it('should accept regular package names', () => {
    expect(isValidPackageName('lodash')).to.be.true;
    expect(isValidPackageName('stream-browserify')).to.be.true;
  });
  it('should accept scoped package names', () => {
    expect(isValidPackageName('@types/node')).to.be.true;
  });
  it('should accept existing packages whose names collide with Node core module names', () => {
    expect(isValidPackageName('events')).to.be.true;
    expect(isValidPackageName('string_decoder')).to.be.true;
    expect(isValidPackageName('punycode')).to.be.true;
    expect(isValidPackageName('constants')).to.be.true;
  });
  it('should reject invalid package names', () => {
    expect(isValidPackageName('')).to.be.false;
    expect(isValidPackageName('.start-with-period')).to.be.false;
    expect(isValidPackageName('_start-with-underscore')).to.be.false;
    expect(isValidPackageName('name with spaces')).to.be.false;
    expect(isValidPackageName('scope/name')).to.be.false;
  });
});

describe('extractPackageName', () => {
  it('should return the name as-is when no version is specified', () => {
    expect(extractPackageName('lodash')).to.equal('lodash');
    expect(extractPackageName('@types/node')).to.equal('@types/node');
  });
  it('should strip the version from unscoped packages', () => {
    expect(extractPackageName('lodash@4.17.21')).to.equal('lodash');
  });
  it('should strip the version from scoped packages', () => {
    expect(extractPackageName('@types/node@20.1.0')).to.equal('@types/node');
  });
  it('should keep git and https urls as-is', () => {
    expect(extractPackageName('https://example.com/foo.tgz')).to.equal('https://example.com/foo.tgz');
    expect(extractPackageName('git+https://example.com/foo.git')).to.equal('git+https://example.com/foo.git');
  });
});
