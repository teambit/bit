import { expect } from 'chai';
import * as path from 'path';

import { OVERRIDE_COMPONENT_PREFIX } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

describe('dependencies versions resolution', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component with dependencies and package dependencies', () => {
    let authorScope;
    let scopeAfterImport;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
      helper.fixtures.addComponentBarFoo();
      authorScope = helper.scopeHelper.cloneLocalScope();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      scopeAfterImport = helper.scopeHelper.cloneLocalScope();
    });
    it('when nothing is changed should show the dependency version from the model', () => {
      const output = helper.command.showComponentParsed('bar/foo -c');
      expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
        `${helper.scopes.remote}/utils/is-string@0.0.1`
      );
    });
    describe('when package.json overrides the version', () => {
      before(() => {
        const componentPath = path.join(helper.scopes.localPath, 'components/bar/foo');
        const packageJson = helper.packageJson.read(componentPath);
        packageJson.bit = {};
        packageJson.bit.overrides = {
          dependencies: {
            [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.10',
          },
        };
        helper.packageJson.write(packageJson, componentPath);
      });
      it('should use the dependency version from bit.json', () => {
        const output = helper.command.showComponentParsed('bar/foo -c');
        expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
          `${helper.scopes.remote}/utils/is-string@0.0.10`
        );
      });
    });
    // Skipped since --conf is disabled for legacy projects
    describe.skip('when bit.json overrides the version', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
        helper.command.importComponent('bar/foo --conf');
        const bitJsonDir = path.join(helper.scopes.localPath, 'components/bar/foo');
        const bitJson = helper.bitJson.read(bitJsonDir);
        bitJson.overrides = {
          dependencies: {
            [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.2',
          },
        };
        helper.bitJson.write(bitJson, bitJsonDir);
      });
      it('should use the dependency version from bit.json', () => {
        const output = helper.command.showComponentParsed('bar/foo -c');
        expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
          `${helper.scopes.remote}/utils/is-string@0.0.2`
        );
      });
      describe('when package.json and bit.json override the version differently', () => {
        before(() => {
          const componentPath = path.join(helper.scopes.localPath, 'components/bar/foo');
          const packageJson = helper.packageJson.read(componentPath);
          packageJson.bit = {};
          packageJson.bit.overrides = {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.10',
            },
          };
          helper.packageJson.write(packageJson, componentPath);
        });
        it('bit.json should win', () => {
          const output = helper.command.showComponentParsed('bar/foo -c');
          expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
            `${helper.scopes.remote}/utils/is-string@0.0.2`
          );
        });
      });
    });
    describe('when consumer config overrides the version of the imported component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
        const bitJson = helper.bitJson.read();
        bitJson.overrides = {
          'bar/foo': {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.5',
            },
          },
        };
        helper.bitJson.write(bitJson);
      });
      it('should use the dependency version from the consumer config as it is imported', () => {
        const output = helper.command.showComponentParsed('bar/foo -c');
        expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
          `${helper.scopes.remote}/utils/is-string@0.0.5`
        );
      });
      describe('when the consumer config conflicts the component config', () => {
        before(() => {
          const componentPath = path.join(helper.scopes.localPath, 'components/bar/foo');
          const packageJson = helper.packageJson.read(componentPath);
          packageJson.bit = {};
          packageJson.bit.overrides = {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.10',
            },
          };
          helper.packageJson.write(packageJson, componentPath);
        });
        it('component config should win', () => {
          const output = helper.command.showComponentParsed('bar/foo -c');
          expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
            `${helper.scopes.remote}/utils/is-string@0.0.10`
          );
        });
      });
    });
    describe('when consumer config overrides with glob patterns for author', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(authorScope);
        const bitJson = helper.bitJson.read();
        bitJson.overrides = {
          'bar/*': {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.5',
            },
          },
        };
        helper.bitJson.write(bitJson);
      });
      it('should use the dependency version from the consumer config', () => {
        const output = helper.command.showComponentParsed('bar/foo');
        expect(output.dependencies[0].id).to.equal('utils/is-string@0.0.5');
      });
    });
  });

  describe.skip('when package.json has different version than the model', () => {
    describe('when the package.json of the dependents is different', () => {
      it('should use the dependency version from package.json', () => {});
    });
    describe('when the package.json of the dependency is different', () => {
      it('should use the dependency version from package.json', () => {});
    });
    describe('when the package.json of the dependents has ~ or ^ characters', () => {
      it('should strip those characters and get the exact version', () => {});
    });
    describe('when the the dependents has package.json file but it does not contain the dependency and the root package.json does', () => {
      // @todo: this should be fixed in resolvePackageData() to work this way
      // currently if it finds package.json in the dependents it stops there, doesn't find the
      // dependency and goes directly to the dependency directory.
      it('should find the dependency version from the root package.json', () => {});
    });
  });
  describe.skip('when bitmap has different version than the model', () => {
    it('should use the dependency version from the bitmap', () => {});
  });
  describe.skip('when only the model has a version', () => {
    it('should use the dependency version from the model', () => {});
  });
});
