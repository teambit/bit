import chai, { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('component config', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when importing a component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
      helper.fixtures.addComponentBarFoo();
      helper.env.importDummyCompiler();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteEnvironment();
    });
    describe('importing without --conf flag', () => {
      let scopeAfterImport;
      let packageJson;
      before(() => {
        helper.command.importComponent('bar/foo');
        scopeAfterImport = helper.scopeHelper.cloneLocalScope();
        packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
      });
      it('should write the configuration data into the component package.json file', () => {
        expect(packageJson).to.have.property('bit');
        expect(packageJson.bit).to.have.property('env');
      });
      it('should not write the "overrides" key into bit as it is empty', () => {
        expect(packageJson).to.have.property('bit');
        expect(packageJson.bit).to.not.have.property('overrides');
      });
      describe('backward compatibility. saving the dependencies into bit.json as it was before v14.0.5', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
          const componentDir = path.join(helper.scopes.localPath, 'components/bar/foo');
          const bitJson = helper.bitJson.read(componentDir);
          bitJson.dependencies = { [`${helper.scopes.remote}/utils/is-string`]: '0.0.1' };
          helper.bitJson.write(bitJson, componentDir);

          const consumerBitJson = helper.bitJson.read();
          consumerBitJson.dependencies = { [`${helper.scopes.remote}/bar/foo`]: '0.0.1' };
          helper.bitJson.write(bitJson);
        });
        it('Bit should not explode', () => {
          helper.command.showComponent('bar/foo');
          helper.command.status();
          helper.command.listLocalScope();
          helper.fs.createFile('components/bar/foo/bar', 'foo.js', 'console.log("hello");');
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
        });
      });
      describe('changing the environments on package.json', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
          const componentDir = path.join(helper.scopes.localPath, 'components/bar/foo');
          packageJson.bit.env = {
            compiler: 'my-scope/compiler/my-compiler',
          };
          helper.packageJson.write(packageJson, componentDir);
        });
        it('diff should show the newly added compiler', () => {
          const diff = helper.command.diff('bar/foo');
          expect(diff).to.have.string('--- Compiler');
          expect(diff).to.have.string('+++ Compiler');
          expect(diff).to.have.string('+ my-scope/compiler/my-compiler');
        });
      });
      describe('when workspace config has a compiler set for this component', () => {
        before(() => {
          const overrides = {
            'bar/*': {
              env: {
                compiler: 'bit.env/my-workspace-compiler@0.0.1',
              },
            },
          };
          helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
          helper.bitJson.addOverrides(overrides);
        });
        describe('and the component config has the environment with minus sign', () => {
          before(() => {
            const componentDir = path.join(helper.scopes.localPath, 'components/bar/foo');
            packageJson.bit.env = {
              compiler: '-',
            };
            helper.packageJson.write(packageJson, componentDir);
          });
          it('diff should show the removed compiler', () => {
            const diff = helper.command.diff('bar/foo');
            expect(diff).to.have.string('--- Compiler');
            expect(diff).to.have.string('+++ Compiler');
            expect(diff).to.have.string(`- ${helper.scopes.env}/compilers/dummy@0.0.1`);
          });
          it('bit show should not show any compiler', () => {
            const show = helper.command.showComponent();
            expect(show).to.not.have.string('Compiler');
          });
        });
        describe('and the environment key is removed from component config', () => {
          before(() => {
            const componentDir = path.join(helper.scopes.localPath, 'components/bar/foo');
            packageJson.bit.env = {};
            helper.packageJson.write(packageJson, componentDir);
          });
          it('diff should show the removed component-compiler and added workspace-compiler', () => {
            const diff = helper.command.diff('bar/foo');
            expect(diff).to.have.string('--- Compiler');
            expect(diff).to.have.string('+++ Compiler');
            expect(diff).to.have.string(`- ${helper.scopes.env}/compilers/dummy@0.0.1`);
            expect(diff).to.have.string('+ bit.env/my-workspace-compiler@0.0.1');
          });
        });
      });
    });
  });
  describe('a component with overrides settings', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.npm.addNpmPackage('chai', '2.4');
      helper.packageJson.create({ dependencies: { chai: '2.4' } });
      const overrides = {
        'bar/foo': {
          dependencies: {
            chai: '-',
          },
          peerDependencies: {
            chai: '+',
          },
        },
      };
      helper.bitJson.addOverrides(overrides);
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    describe('deleting the package.json of the component', () => {
      // tests https://github.com/teambit/bit/issues/2035
      before(() => {
        helper.fs.deletePath('components/bar/foo/package.json');
      });
      it('bit status should not throw an error', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
});
