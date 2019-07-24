import { expect } from 'chai';
import isTestFile from './is-test-file';

describe('isTestFile', () => {
  it('should return true for files ending with [spec|test|specs|tests].[js|jsx|ts|tsx])', () => {
    expect(isTestFile('foo.spec.js')).to.be.true;
    expect(isTestFile('foo.spec.ts')).to.be.true;
    expect(isTestFile('foo.spec.tsx')).to.be.true;
    expect(isTestFile('foo.spec.jsx')).to.be.true;
    expect(isTestFile('foo.test.js')).to.be.true;
    expect(isTestFile('foo.test.ts')).to.be.true;
    expect(isTestFile('foo.test.tsx')).to.be.true;
    expect(isTestFile('foo.test.jsx')).to.be.true;
    expect(isTestFile('foo.specs.js')).to.be.true;
    expect(isTestFile('foo.tests.js')).to.be.true;
  });
  it('should return false for anything else', () => {
    expect(isTestFile('foo.testjs')).to.be.false;
    expect(isTestFile('foo.test.jsv')).to.be.false;
    expect(isTestFile('test.js')).to.be.false;
    expect(isTestFile('spec.js')).to.be.false;
    expect(isTestFile('foo.spec.bar.js')).to.be.false;
  });
});
