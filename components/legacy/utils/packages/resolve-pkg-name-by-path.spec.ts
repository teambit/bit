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
});
