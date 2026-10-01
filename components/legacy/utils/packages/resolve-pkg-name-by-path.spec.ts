import { expect } from 'chai';
import { resolvePackageNameByPath } from './resolve-pkg-name-by-path';

describe('resolvePackageNameByPath', () => {
  it('should return the correct package for non-scoped package', () => {
    expect(resolvePackageNameByPath('lodash/internal/file')).to.equal('lodash');
  });
  it('should return the correct package for scoped package', () => {
    expect(resolvePackageNameByPath('@angular/core/src/utils.ts')).to.equal('@angular/core');
  });
  it('should return the correct package for webpack sass-loader path (with tilda) and scoped package', () => {
    expect(resolvePackageNameByPath('~@teambit/base-ui.theme.colors/colors.module.scss')).to.equal(
      '@teambit/base-ui.theme.colors'
    );
  });
  it('should remove the tilda for a non-scoped package', () => {
    expect(resolvePackageNameByPath('~mypackage/style.scss')).to.equal('mypackage');
  });
  it('should return the package as-is when the import has no inner path', () => {
    expect(resolvePackageNameByPath('lodash')).to.equal('lodash');
  });
  it('should normalize windows-style separators', () => {
    expect(resolvePackageNameByPath('lodash\\internal\\file')).to.equal('lodash');
  });
  // Regression: a require/import with a trailing slash like `require('events/')` - a common pattern
  // in webpack browser-fallback configs - must resolve to the *package* name (`events`). The
  // single-segment branch used to return the original, non-normalized string, so `events/` leaked
  // into downstream consumers (e.g. the MissingPackagesDependenciesOnFs issue) and no longer
  // matched the real package name.
  it('should strip a trailing slash from a package with no inner path', () => {
    expect(resolvePackageNameByPath('events/')).to.equal('events');
  });
  it('should strip a trailing slash from a scoped package', () => {
    expect(resolvePackageNameByPath('@angular/core/')).to.equal('@angular/core');
  });
});
