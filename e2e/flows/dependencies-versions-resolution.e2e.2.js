import path from 'path';
import { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import { OVERRIDE_COMPONENT_PREFIX } from '../../src/constants';

describe('dependencies versions resolution', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('component with dependencies and package dependencies', () => {
    let authorScope;
    let scopeAfterImport;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      authorScope = helper.cloneLocalScope();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      scopeAfterImport = helper.cloneLocalScope();
    });
    it('when nothing is changed should show the dependency version from the model', () => {
      const output = helper.showComponentParsed('bar/foo -c');
      expect(output.componentFromFileSystem.dependencies[0].id).to.equal(`${helper.remoteScope}/utils/is-string@0.0.1`);
    });
    describe('when package.json overrides the version', () => {
      before(() => {
        const componentPath = path.join(helper.localScopePath, 'components/bar/foo');
        const packageJson = helper.readPackageJson(componentPath);
        packageJson.bit = {};
        packageJson.bit.overrides = {
          dependencies: {
            [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.10'
          }
        };
        helper.writePackageJson(packageJson, componentPath);
      });
      it('should use the dependency version from bit.json', () => {
        const output = helper.showComponentParsed('bar/foo -c');
        expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
          `${helper.remoteScope}/utils/is-string@0.0.10`
        );
      });
    });
    describe('when bit.json overrides the version', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterImport);
        helper.importComponent('bar/foo --conf');
        const bitJsonDir = path.join(helper.localScopePath, 'components/bar/foo');
        const bitJson = helper.readBitJson(bitJsonDir);
        bitJson.overrides = {
          dependencies: {
            [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.2'
          }
        };
        helper.writeBitJson(bitJson, bitJsonDir);
      });
      it('should use the dependency version from bit.json', () => {
        const output = helper.showComponentParsed('bar/foo -c');
        expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
          `${helper.remoteScope}/utils/is-string@0.0.2`
        );
      });
      describe('when package.json and bit.json override the version differently', () => {
        before(() => {
          const componentPath = path.join(helper.localScopePath, 'components/bar/foo');
          const packageJson = helper.readPackageJson(componentPath);
          packageJson.bit = {};
          packageJson.bit.overrides = {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.10'
            }
          };
          helper.writePackageJson(packageJson, componentPath);
        });
        it('bit.json should win', () => {
          const output = helper.showComponentParsed('bar/foo -c');
          expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
            `${helper.remoteScope}/utils/is-string@0.0.2`
          );
        });
      });
    });
    describe('when consumer config overrides the version of the imported component', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterImport);
        const bitJson = helper.readBitJson();
        bitJson.overrides = {
          'bar/foo': {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.5'
            }
          }
        };
        helper.writeBitJson(bitJson);
      });
      it('should use the dependency version from the consumer config as it is imported', () => {
        const output = helper.showComponentParsed('bar/foo -c');
        expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
          `${helper.remoteScope}/utils/is-string@0.0.5`
        );
      });
      describe('when the consumer config conflicts the component config', () => {
        before(() => {
          const componentPath = path.join(helper.localScopePath, 'components/bar/foo');
          const packageJson = helper.readPackageJson(componentPath);
          packageJson.bit = {};
          packageJson.bit.overrides = {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.10'
            }
          };
          helper.writePackageJson(packageJson, componentPath);
        });
        it('component config should win', () => {
          const output = helper.showComponentParsed('bar/foo -c');
          expect(output.componentFromFileSystem.dependencies[0].id).to.equal(
            `${helper.remoteScope}/utils/is-string@0.0.10`
          );
        });
      });
    });
    describe('when consumer config overrides with glob patterns for author', () => {
      before(() => {
        helper.getClonedLocalScope(authorScope);
        const bitJson = helper.readBitJson();
        bitJson.overrides = {
          'bar/*': {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}utils/is-string`]: '0.0.5'
            }
          }
        };
        helper.writeBitJson(bitJson);
      });
      it('should use the dependency version from the consumer config', () => {
        const output = helper.showComponentParsed('bar/foo');
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
      // @todo: this should be fixed in bit-javascript resolveNodePackage() to work this way
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
