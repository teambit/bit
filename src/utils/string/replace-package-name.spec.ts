import { expect } from 'chai';

import replacePackageName from './replace-package-name';

describe('replacePackageName', () => {
  it('should replace package surrounded with single quotes', () => {
    const str = "require('@bit/old-scope.is-string');";
    const result = replacePackageName(str, '@bit/old-scope.is-string', '@bit/new-scope.is-string');
    expect(result).to.equal("require('@bit/new-scope.is-string');");
  });
  it('should replace package surrounded with double quotes', () => {
    const str = 'require("@bit/old-scope.is-string");';
    const result = replacePackageName(str, '@bit/old-scope.is-string', '@bit/new-scope.is-string');
    expect(result).to.equal('require("@bit/new-scope.is-string");');
  });
  it('should replace package path consist of an internal path', () => {
    const str = "require('@bit/old-scope.is-string/some-internal-path');";
    const result = replacePackageName(str, '@bit/old-scope.is-string', '@bit/new-scope.is-string');
    expect(result).to.equal("require('@bit/new-scope.is-string/some-internal-path');");
  });
  it('should not replace package when it matches only part of the package-name', () => {
    const str = "require('@bit/old-scope.is-string-util');";
    const result = replacePackageName(str, '@bit/old-scope.is-string', '@bit/new-scope.is-string');
    expect(result).to.equal("require('@bit/old-scope.is-string-util');");
  });
  it('should replace package that its require statement has tilda (~)', () => {
    const str = "@import '~@bit/old-scope.ui.style/my-style.scss';";
    const result = replacePackageName(str, '@bit/old-scope.ui.style', '@bit/new-scope.ui.style');
    expect(result).to.equal("@import '~@bit/new-scope.ui.style/my-style.scss';");
  });
  it('should ignore package that its require statement has other prefixes', () => {
    const str = "@import '$@bit/old-scope.ui.style';";
    const result = replacePackageName(str, '@bit/old-scope.ui.style', '@bit/new-scope.ui.style');
    expect(result).to.equal("@import '$@bit/old-scope.ui.style';");
  });
});
