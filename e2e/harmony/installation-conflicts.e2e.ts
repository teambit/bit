import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('conflict between components and dependencies', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
    helper.scopeHelper.reInitLocalScope();
    helper.bitJsonc.setupDefault();
    helper.extensions.addExtensionToVariant('comp1', 'teambit.pkg/pkg', {
      packageJson: {
        name: 'is-positive',
      },
    });
    helper.packageJson.write({
      dependencies: { 'is-positive': '1.0.0' },
    });
    helper.fixtures.populateComponents(1, false, '', false);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should throw an error on install', () => {
    expect(() => helper.command.install()).to.throw(
      'The following packages are conflicting with components in the workspace: is-positive'
    );
  });
});
