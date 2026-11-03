import { expect } from 'chai';
import { getPackageNameFromTarget } from './get-package-name-from-target';

describe('getPackageNameFromTarget', () => {
  it('should handle POSIX scoped packages', () => {
    expect(getPackageNameFromTarget('/workspace/node_modules/@teambit/harmony/dist/index.js')).to.equal(
      './node_modules/@teambit/harmony'
    );
  });
  it('should handle Windows scoped packages with backslashes', () => {
    expect(getPackageNameFromTarget('C:\\workspace\\node_modules\\@teambit\\harmony\\dist\\index.js')).to.equal(
      './node_modules/@teambit/harmony'
    );
  });
  it('should handle POSIX unscoped packages', () => {
    expect(getPackageNameFromTarget('/workspace/node_modules/lodash/index.js')).to.equal('./node_modules/lodash');
  });
  it('should handle Windows unscoped packages with backslashes', () => {
    expect(getPackageNameFromTarget('C:\\workspace\\node_modules\\lodash\\index.js')).to.equal(
      './node_modules/lodash'
    );
  });
});
