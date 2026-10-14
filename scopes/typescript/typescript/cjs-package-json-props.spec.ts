import { expect } from 'chai';
import { TypescriptMain } from './typescript.main.runtime';
import { getCjsPackageJsonProps } from './cjs-package-json-props';

describe('getCjsPackageJsonProps()', () => {
  it('should be the props the typescript aspect returns from getCjsPackageJsonProps()', () => {
    // the native installer reads the props without loading the aspect; the two must not drift.
    expect(getCjsPackageJsonProps()).to.deep.equal(TypescriptMain.prototype.getCjsPackageJsonProps.call(undefined));
  });
});
