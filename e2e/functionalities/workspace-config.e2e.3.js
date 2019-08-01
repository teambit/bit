import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import { statusFailureMsg, statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { OVERRIDE_COMPONENT_PREFIX, OVERRIDE_FILE_PREFIX } from '../../src/constants';

chai.use(require('chai-fs'));

describe('workspace config', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when the config exists in both bit.json and package.json', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.initNpm();
      const packageJson = helper.readPackageJson();
      packageJson.bit = {
        env: {},
        componentsDefaultDirectory: 'components/{name}',
        packageManager: 'npm'
      };
      helper.writePackageJson(packageJson);
      localScope = helper.cloneLocalScope();
    });
    describe('when the config conflicts between bit.json and package.json', () => {
      before(() => {
        const bitJson = helper.readBitJson();
        bitJson.componentsDefaultDirectory = 'customBitJson/{name}';
        helper.writeBitJson(bitJson);

        const packageJson = helper.readPackageJson();
        packageJson.bit.componentsDefaultDirectory = 'customPackageJson/{name}';
        helper.writePackageJson(packageJson);
      });
      it('should use the config from bit.json and not from package.json', () => {
        helper.importComponent('bar/foo');
        expect(path.join(helper.localScopePath, 'customBitJson')).to.be.a.directory();
        expect(path.join(helper.localScopePath, 'customPackageJson')).to.not.be.a.path();
      });
    });
    describe('when Bit writes config data', () => {
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.importComponent('bar/foo -c');
      });
      it('should write the config data to both bit.json and package.json', () => {
        const bitJson = helper.readBitJson();
        expect(bitJson.env).to.have.property('compiler');
        expect(bitJson.env.compiler).to.equal(`${helper.remoteScope}/bar/foo@0.0.1`);

        const packageJson = helper.readPackageJson();
        expect(packageJson.bit.env).to.have.property('compiler');
        expect(packageJson.bit.env.compiler).to.equal(`${helper.remoteScope}/bar/foo@0.0.1`);
      });
    });
  });
  describe('overrides components', () => {
    describe('changing component dependencies versions', () => {
      let localScope;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'foo.js');
        helper.createFile('', 'bar.js', "require('./foo');");
        helper.addComponent('foo.js');
        helper.addComponent('bar.js');
        helper.tagAllComponents();
        helper.tagScope('2.0.0');
        localScope = helper.cloneLocalScope();
      });
      describe('from bit.json', () => {
        before(() => {
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
        });
        it('bit diff should show the tagged dependency version vs the version from overrides', () => {
          const diff = helper.diff('bar');
          expect(diff).to.have.string('- [ foo@2.0.0 ]');
          expect(diff).to.have.string('+ [ foo@0.0.1 ]');
        });
        it('should not duplicate the dependencies or add anything to the package dependencies', () => {
          const bar = helper.showComponentParsed('bar');
          expect(bar.dependencies).to.have.lengthOf(1);
          expect(Object.keys(bar.packageDependencies)).to.have.lengthOf(0);
        });
        describe('tagging the component', () => {
          before(() => {
            helper.tagAllComponents();
          });
          it('should save the overridden dependency version', () => {
            const bar = helper.catComponent('bar@latest');
            expect(bar.dependencies[0].id.version).to.equal('0.0.1');
            expect(bar.flattenedDependencies[0].version).to.equal('0.0.1');
          });
        });
      });
      describe('from package.json', () => {
        before(() => {
          helper.getClonedLocalScope(localScope);
          helper.deletePath('bit.json');
          helper.initNpm();
          helper.runCmd('bit init');
          const packageJson = helper.readPackageJson();
          expect(packageJson).to.have.property('bit');
          packageJson.bit.overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1'
              }
            }
          };
          helper.writePackageJson(packageJson);
        });
        it('bit status should not delete "bit.overrides" property of package.json', () => {
          helper.status();
          const packageJson = helper.readPackageJson();
          expect(packageJson).to.have.property('bit');
          expect(packageJson.bit).to.have.property('overrides');
        });
        it('bit diff should show the tagged dependency version vs the version from overrides', () => {
          const diff = helper.diff('bar');
          expect(diff).to.have.string('- [ foo@2.0.0 ]');
          expect(diff).to.have.string('+ [ foo@0.0.1 ]');
        });
        describe('tagging the component', () => {
          before(() => {
            helper.tagAllComponents();
          });
          it('should save the overridden dependency version', () => {
            const bar = helper.catComponent('bar@latest');
            expect(bar.dependencies[0].id.version).to.equal('0.0.1');
            expect(bar.flattenedDependencies[0].version).to.equal('0.0.1');
          });
        });
      });
    });
    describe('changing packages dependencies versions', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponentBarFoo('require("chai");');
        helper.addComponentBarFoo();
        helper.addNpmPackage('chai', '2.4.0');
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '4.0.0'
            }
          }
        };
        helper.addOverridesToBitJson(overrides);
      });
      it('should show the overridden package version', () => {
        const bar = helper.showComponentParsed('bar/foo');
        expect(Object.keys(bar.packageDependencies)).to.have.lengthOf(1);
        expect(bar.packageDependencies).to.deep.equal({ chai: '4.0.0' });
      });
      describe('tagging the component', () => {
        before(() => {
          helper.tagAllComponents();
        });
        it('should save the overridden package version', () => {
          const bar = helper.catComponent('bar/foo@latest');
          expect(bar.packageDependencies).to.deep.equal({ chai: '4.0.0' });
        });
      });
    });
    describe('ignoring files and components dependencies', () => {
      let scopeAfterAdding;
      let remoteScopeEmpty;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('foo-dir', 'foo1.js');
        helper.createFile('foo-dir', 'foo2.js');
        helper.createFile('bar-dir', 'bar.js', "require('../foo-dir/foo1'); require('../foo-dir/foo2'); ");
        helper.addComponent('foo-dir/foo1.js', { i: 'utils/foo/foo1' });
        helper.addComponent('foo-dir/foo2.js', { i: 'utils/foo/foo2' });
        helper.addComponent('bar-dir/bar.js', { i: 'bar' });
        scopeAfterAdding = helper.cloneLocalScope();
        remoteScopeEmpty = helper.cloneRemoteScope();
      });
      describe('ignoring the component file altogether', () => {
        let showBar;
        before(() => {
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_FILE_PREFIX}bar-dir/bar.js`]: '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should not add any dependency to the component', () => {
          expect(showBar.dependencies).to.have.lengthOf(0);
        });
        it('should show the component file as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('bar-dir/bar.js');
        });
      });
      describe('ignoring a dependency file', () => {
        let showBar;
        before(() => {
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_FILE_PREFIX}foo-dir/foo2.js`]: '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should not add the removed dependency to the component', () => {
          expect(showBar.dependencies).to.have.lengthOf(1);
          expect(showBar.dependencies[0].id).to.not.have.string('foo2');
        });
        it('should show the dependency file as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('foo-dir/foo2.js');
        });
        describe('when running from an inner directory', () => {
          before(() => {
            const showBarStr = helper.runCmd('bit show bar --json', path.join(helper.localScopePath, 'bar-dir'));
            showBar = JSON.parse(showBarStr);
          });
          it('should behave the same as if was running from consumer root', () => {
            expect(showBar.dependencies).to.have.lengthOf(1);
            expect(showBar.dependencies[0].id).to.not.have.string('foo2');
            expect(showBar).to.have.property('manuallyRemovedDependencies');
            expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
            expect(showBar.manuallyRemovedDependencies.dependencies).to.include('foo-dir/foo2.js');
          });
        });
      });
      describe('ignoring a dependencies files with a glob pattern', () => {
        let showBar;
        before(() => {
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_FILE_PREFIX}foo-dir/*`]: '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should remove all dependencies matching the glob pattern', () => {
          expect(showBar.dependencies).to.have.lengthOf(0);
        });
        it('should show the dependencies files as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('foo-dir/foo2.js');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('foo-dir/foo1.js');
        });
      });
      describe('ignoring a dependency component', () => {
        describe('when requiring with relative path', () => {
          before(() => {
            const overrides = {
              bar: {
                dependencies: {
                  [`${OVERRIDE_COMPONENT_PREFIX}utils/foo/foo1`]: '-'
                }
              }
            };
            helper.addOverridesToBitJson(overrides);
          });
          it('should throw an error', () => {
            const showCmd = () => helper.showComponentParsed('bar');
            expect(showCmd).to.throw();
          });
        });
        describe('when requiring with module path', () => {
          let showBar;
          before(() => {
            helper.getClonedLocalScope(scopeAfterAdding);
            helper.tagAllComponents();
            helper.exportAllComponents();
            helper.createFile(
              'bar-dir',
              'bar.js',
              `require('@bit/${helper.remoteScope}.utils.foo.foo1'); require('@bit/${
                helper.remoteScope
              }.utils.foo.foo2'); `
            );
            const overrides = {
              bar: {
                dependencies: {
                  [`${OVERRIDE_COMPONENT_PREFIX}utils/foo/foo1`]: '-'
                }
              }
            };
            helper.addOverridesToBitJson(overrides);
            showBar = helper.showComponentParsed('bar');
          });
          it('should not add the removed dependency to the component', () => {
            expect(showBar.dependencies).to.have.lengthOf(1);
            expect(showBar.dependencies[0].id).to.not.equal('foo1');
          });
          it('should show the dependency component as ignored', () => {
            expect(showBar).to.have.property('manuallyRemovedDependencies');
            expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
            expect(showBar.manuallyRemovedDependencies.dependencies).to.include(`${helper.remoteScope}/utils/foo/foo1`);
          });
        });
      });
      describe('ignoring a dependencies components by wildcards', () => {
        let showBar;
        before(() => {
          helper.getClonedLocalScope(scopeAfterAdding);
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}utils/foo/*`]: '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should not ignore the dependencies as we do not support ignoring dependencies components by wildcards', () => {
          expect(showBar.dependencies).to.have.lengthOf(2);
        });
        it('should not show the dependencies component as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.deep.equal({});
        });
      });
      describe('ignoring a missing file', () => {
        let showBar;
        before(() => {
          helper.createFile(
            'bar-dir',
            'bar.js',
            "require('../foo-dir/foo1'); require('../foo-dir/foo2'); require('../foo-dir/foo3')"
          );

          // an intermediate step, make sure bit status shows the component with an issue of a missing file
          const status = helper.status();
          expect(status).to.have.string(statusFailureMsg);

          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_FILE_PREFIX}foo-dir/foo3*`]: '-' // we don't enter the entire file foo-dir/foo3.js because the require string doesn't have the extension
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('bit status should not show the component as missing files', () => {
          const status = helper.status();
          expect(status).to.not.have.string(statusFailureMsg);
        });
        it('should show the dependency file as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include(path.normalize('foo-dir/foo3'));
        });
      });
      describe('ignoring a missing component', () => {
        let showBar;
        before(() => {
          helper.getClonedLocalScope(scopeAfterAdding);
          helper.createFile(
            'bar-dir',
            'bar.js',
            "require('../foo-dir/foo1'); require('../foo-dir/foo2'); require('@bit/bit.utils.is-string')"
          );

          // an intermediate step, make sure bit status shows the component with an issue of a missing file
          const status = helper.status();
          expect(status).to.have.string(statusFailureMsg);
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}bit.utils/is-string`]: '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('bit status should not show the component as missing component', () => {
          const status = helper.status();
          expect(status).to.not.have.string(statusFailureMsg);
        });
        it('should show the component as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('bit.utils/is-string');
        });
      });
      describe('ignoring an existing component required as a package', () => {
        let showBar;
        before(() => {
          helper.getClonedLocalScope(scopeAfterAdding);
          helper.getClonedRemoteScope(remoteScopeEmpty);
          helper.tagAllComponents();
          helper.exportAllComponents();
          helper.createFile(
            'bar-dir',
            'bar.js',
            `require('@bit/${helper.remoteScope}.utils.foo.foo1'); require('../foo-dir/foo2');`
          );
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}utils/foo/foo1`]: '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should ignore the specified component dependency', () => {
          expect(showBar.dependencies).to.have.lengthOf(1);
          expect(showBar.dependencies[0].id).to.have.string('foo2');
        });
        it('should show the component dependency as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include(`${helper.remoteScope}/utils/foo/foo1`);
        });
      });
    });
    describe('ignoring packages dependencies', () => {
      describe('ignoring a missing package', () => {
        let showBar;
        before(() => {
          helper.reInitLocalScope();
          helper.createFile('bar-dir', 'bar.js', "require('non-exist-package')");
          helper.addComponent('bar-dir/bar.js', { i: 'bar' });

          // an intermediate step, make sure bit status shows the component with an issue of a missing file
          const status = helper.status();
          expect(status).to.have.string(statusFailureMsg);
          const overrides = {
            bar: {
              dependencies: {
                'non-exist-package': '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('bit status should not show the component as missing packages', () => {
          const status = helper.status();
          expect(status).to.not.have.string(statusFailureMsg);
        });
        it('should show the package as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('non-exist-package');
        });
      });
      describe('ignoring an existing package', () => {
        let showBar;
        before(() => {
          helper.reInitLocalScope();
          helper.addNpmPackage('existing-package');
          helper.addNpmPackage('another-existing-package');
          helper.createFile('bar-dir', 'bar.js', "require('existing-package'); require('another-existing-package');");
          helper.addComponent('bar-dir/bar.js', { i: 'bar' });
          const overrides = {
            bar: {
              dependencies: {
                'existing-package': '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should ignore the specified package but keep other packages intact', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(1);
          expect(Object.keys(showBar.packageDependencies)[0]).to.equal('another-existing-package');
        });
        it('should show the package as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('existing-package');
        });
      });
      describe('ignoring an existing devDependency package', () => {
        let showBar;
        before(() => {
          helper.reInitLocalScope();
          helper.addNpmPackage('existing-package');
          helper.addNpmPackage('another-existing-package');
          helper.createFile('bar-dir', 'bar.js');
          helper.createFile(
            'bar-dir',
            'bar.spec.js',
            "require('existing-package'); require('another-existing-package');"
          );
          helper.addComponent('bar-dir/*', { i: 'bar', m: 'bar-dir/bar.js', t: 'bar-dir/bar.spec.js' });

          const overrides = {
            bar: {
              devDependencies: {
                'existing-package': '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should ignore the specified package but keep other packages intact', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(0);
          expect(Object.keys(showBar.devPackageDependencies)).to.have.lengthOf(1);
          expect(Object.keys(showBar.devPackageDependencies)[0]).to.equal('another-existing-package');
        });
        it('should show the package as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('devDependencies');
          expect(showBar.manuallyRemovedDependencies.devDependencies).to.include('existing-package');
        });
        it('should not confuse ignore of dependencies with ignore of devDependencies', () => {
          expect(showBar.manuallyRemovedDependencies).to.not.have.property('dependencies');
        });
      });
      describe('ignoring an existing peerDependency package', () => {
        let showBar;
        before(() => {
          // keep in mind that the 'chai' dependency is a regular package dependency, which
          // also saved as a peerDependency
          helper.reInitLocalScope();
          helper.createComponentBarFoo("import chai from 'chai';");
          helper.addNpmPackage('chai', '2.4');
          helper.createPackageJson({ peerDependencies: { chai: '>= 2.1.2 < 5' } });
          helper.addComponentBarFoo();
          const overrides = {
            'bar/foo': {
              peerDependencies: {
                chai: '-'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar/foo');
        });
        it('should ignore the specified peer package', () => {
          expect(Object.keys(showBar.peerPackageDependencies)).to.have.lengthOf(0);
        });
        it('should keep the dependency package intact', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(1);
        });
        it('should show the package as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('peerDependencies');
          expect(showBar.manuallyRemovedDependencies.peerDependencies).to.include('chai');
        });
        it('should not confuse ignore of dependencies/devDependencies with ignore of peerDependencies', () => {
          expect(showBar.manuallyRemovedDependencies).to.not.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies).to.not.have.property('devDependencies');
        });
      });
    });
    describe('ignoring dependencies components entire flow', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'foo1.js');
        helper.createFile('', 'foo2.js');
        helper.createFile('', 'bar.js');
        helper.addComponent('foo1.js');
        helper.addComponent('foo2.js');
        helper.addComponent('bar.js');
        helper.tagAllComponents();
        helper.exportAllComponents();
        helper.createFile(
          '',
          'bar.js',
          `require('@bit/${helper.remoteScope}.foo1'); require('@bit/${helper.remoteScope}.foo2');`
        );

        const overrides = {
          bar: {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}foo2`]: '-'
            }
          }
        };
        helper.addOverridesToBitJson(overrides);
      });
      describe('tagging the component', () => {
        let output;
        let catBar;
        before(() => {
          output = helper.runWithTryCatch('bit tag bar');
          catBar = helper.catComponent('bar@latest');
        });
        it('should be able to tag successfully', () => {
          expect(output).to.have.string('1 component(s) tagged');
        });
        it('should remove the dependency from the model', () => {
          expect(catBar.dependencies).to.have.lengthOf(1);
        });
        it('should save the overrides data into the model', () => {
          expect(catBar).to.have.property('overrides');
          expect(catBar.overrides).to.have.property('dependencies');
          expect(catBar.overrides.dependencies).to.have.property(`${OVERRIDE_COMPONENT_PREFIX}foo2`);
          expect(catBar.overrides.dependencies[`${OVERRIDE_COMPONENT_PREFIX}foo2`]).to.equal('-');
        });
        it('should not show the component as modified', () => {
          const status = helper.status();
          expect(status).to.not.have.string('modified components');
        });
        describe('importing the component', () => {
          const barRoot = path.join(helper.localScopePath, 'components/bar/');
          before(() => {
            helper.exportAllComponents();
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.importComponent('bar');
          });
          it('should write the overrides data into the package.json of the component', () => {
            const packageJson = helper.readPackageJson(barRoot);
            expect(packageJson).to.have.property('bit');
            expect(packageJson.bit).to.have.property('overrides');
            expect(packageJson.bit.overrides).to.have.property('dependencies');
            expect(packageJson.bit.overrides.dependencies).to.have.property(`${OVERRIDE_COMPONENT_PREFIX}foo2`);
            expect(packageJson.bit.overrides.dependencies[`${OVERRIDE_COMPONENT_PREFIX}foo2`]).to.equal('-');
          });
          it('bit status should not show the component as modified', () => {
            const status = helper.status();
            expect(status).to.have.string(statusWorkspaceIsCleanMsg);
          });
          it('bit diff should not show any diff', () => {
            const diff = helper.diff('bar');
            expect(diff).to.have.string('no diff');
          });
          describe('changing the imported component to not ignore the dependency', () => {
            before(() => {
              const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/'));
              packageJson.bit.overrides.dependencies = {};
              helper.writePackageJson(packageJson, barRoot);
            });
            it('bit status should show the component as modified', () => {
              const status = helper.status();
              expect(status).to.not.have.string(statusWorkspaceIsCleanMsg);
            });
            it('should show the previously ignored dependency as a missing component', () => {
              const status = helper.status();
              expect(status).to.have.string(statusFailureMsg);
              expect(status).to.have.string('missing components');
            });
            it('bit diff should show the overrides differences', () => {
              const diff = helper.diff('bar');
              expect(diff).to.have.string('--- Overrides Dependencies (0.0.2 original)');
              expect(diff).to.have.string('+++ Overrides Dependencies (0.0.2 modified)');
              expect(diff).to.have.string(`- [ ${OVERRIDE_COMPONENT_PREFIX}foo2@- ]`);
            });
          });
        });
      });
    });
    describe('author ignored package, imported changed to not ignore', () => {
      let authorScope;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponentBarFoo("import chai from 'chai';");
        helper.addNpmPackage('chai', '2.4');
        helper.addComponentBarFoo();
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '-'
            }
          }
        };
        helper.addOverridesToBitJson(overrides);
        helper.tagAllComponents();
        helper.exportAllComponents();
        authorScope = helper.cloneLocalScope();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        helper.addNpmPackage('chai', '2.4');
        const componentDir = path.join(helper.localScopePath, 'components/bar/foo');
        const packageJson = helper.readPackageJson(componentDir);
        // an intermediate step to make sure we're good so far
        expect(packageJson.bit.overrides.dependencies).to.deep.equal({ chai: '-' });
        packageJson.bit.overrides.dependencies = {};
        helper.writePackageJson(packageJson, componentDir);
        // an intermediate step to make sure we're good so far
        const diff = helper.diff();
        expect(diff).to.have.string('- [ chai@- ]');
        helper.tagAllComponents();
        helper.exportAllComponents();
      });
      it('should be saved into the model with an empty overrides', () => {
        const barFoo = helper.catComponent('bar/foo@latest');
        expect(barFoo.overrides).to.have.property('dependencies');
        expect(barFoo.overrides.dependencies).to.be.empty;
      });
      it('should be saved into the model with the package in place', () => {
        const barFoo = helper.catComponent('bar/foo@latest');
        expect(barFoo.packageDependencies).to.deep.equal({ chai: '2.4' });
      });
      describe('then, author re-import', () => {
        let scopeAfterReImport;
        before(() => {
          helper.getClonedLocalScope(authorScope);
          helper.importComponent('bar/foo');
          scopeAfterReImport = helper.cloneLocalScope();
        });
        it('bit status should not show the component as modified', () => {
          const status = helper.status();
          expect(status).to.have.string(statusWorkspaceIsCleanMsg);
        });
        it('should save the new overrides to the consumer config', () => {
          const bitJson = helper.readBitJson();
          expect(bitJson.overrides['bar/foo'].dependencies).to.be.empty;
        });
        describe('then author checkout to the first version', () => {
          before(() => {
            helper.checkoutVersion('0.0.1', 'bar/foo');
          });
          it('bit status should not show the component as modified', () => {
            const status = helper.status();
            expect(status).to.not.have.string('modified components');
          });
          it('should show the dependency as ignored', () => {
            const showBar = helper.showComponentParsed('bar/foo');
            expect(showBar).to.have.property('manuallyRemovedDependencies');
            expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
            expect(showBar.manuallyRemovedDependencies.dependencies).to.include('chai');
          });
          it('should save the overrides of the first version into consumer config', () => {
            const bitJson = helper.readBitJson();
            expect(bitJson.overrides['bar/foo'].dependencies).to.not.be.empty;
            expect(bitJson.overrides['bar/foo'].dependencies).to.deep.equal({ chai: '-' });
          });
        });
        describe('then author merge the first version', () => {
          before(() => {
            helper.getClonedLocalScope(scopeAfterReImport);
            helper.mergeVersion('0.0.1', 'bar/foo');
          });
          it('bit status should not show the component as modified', () => {
            const status = helper.status();
            expect(status).to.not.have.string('modified components');
          });
          it('should not show the dependency as ignored', () => {
            const showBar = helper.showComponentParsed('bar/foo');
            expect(showBar).to.have.property('manuallyRemovedDependencies');
            expect(showBar.manuallyRemovedDependencies).to.be.empty;
          });
          it('should not change the consumer config', () => {
            const bitJson = helper.readBitJson();
            expect(bitJson.overrides['bar/foo'].dependencies).to.be.empty;
          });
        });
        describe('when the consumer config is saved also in the package.json file', () => {
          before(() => {
            helper.getClonedLocalScope(authorScope);
            helper.initNpm();
            const packageJson = helper.readPackageJson();
            packageJson.dependencies = { chai: '2.4' };
            packageJson.bit = {
              env: {},
              componentsDefaultDirectory: 'components/{name}',
              packageManager: 'npm'
            };
            helper.writePackageJson(packageJson);
            try {
              helper.importComponent('bar/foo --skip-npm-install');
            } catch (err) {
              // ignore. it shows an error because chai is missing, which is missing by purpose
            }
          });
          it('should still update bit.json', () => {
            const bitJson = helper.readBitJson();
            expect(bitJson.overrides['bar/foo'].dependencies).to.be.empty;
          });
          it('should also update package.json', () => {
            const packageJson = helper.readPackageJson();
            expect(packageJson.bit.overrides['bar/foo'].dependencies).to.be.empty;
          });
        });
      });
    });
    describe('changing overrides of a component in consumer config after tag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.createComponentBarFoo("require('chai');");
        helper.addNpmPackage('chai', '2.4');
        helper.addComponentBarFoo();
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '-'
            }
          }
        };
        helper.addOverridesToBitJson(overrides);
        helper.tagAllComponents();
        const overridesChanged = {
          'bar/foo': {
            dependencies: {}
          }
        };
        helper.addOverridesToBitJson(overridesChanged);
      });
      it('bit status should show the component as modified', () => {
        const status = helper.status();
        expect(status).to.have.string('modified components');
      });
    });
    describe('changing order of the overrides dependencies after tag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.createComponentBarFoo("require('chai'); require('lodash')");
        helper.addNpmPackage('chai', '2.4');
        helper.addNpmPackage('lodash', '2.4');
        helper.addComponentBarFoo();
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '-',
              lodash: '-'
            }
          }
        };
        helper.addOverridesToBitJson(overrides);
        helper.tagAllComponents();
        const overridesChangedOrder = {
          'bar/foo': {
            dependencies: {
              lodash: '-',
              chai: '-'
            }
          }
        };
        helper.addOverridesToBitJson(overridesChangedOrder);
      });
      it('bit status should not show the component as modified', () => {
        const status = helper.status();
        expect(status).to.not.have.string('modified components');
      });
    });
    describe('manually adding dependencies', () => {
      describe('moving a package from dependencies to peerDependencies', () => {
        let showBar;
        before(() => {
          helper.reInitLocalScope();
          helper.createComponentBarFoo("import chai from 'chai';");
          helper.addNpmPackage('chai', '2.4');
          helper.createPackageJson({ dependencies: { chai: '2.4' } });
          helper.addComponentBarFoo();
          const overrides = {
            'bar/foo': {
              dependencies: {
                chai: '-'
              },
              peerDependencies: {
                chai: '+'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar/foo');
        });
        it('should ignore the specified package from dependencies', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(0);
        });
        it('should add the specified package to peerDependencies', () => {
          expect(Object.keys(showBar.peerPackageDependencies)).to.have.lengthOf(1);
          expect(showBar.peerPackageDependencies).to.deep.equal({ chai: '2.4' });
        });
        it('should show the package as ignored from dependencies', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('chai');
        });
        it('should show the package as manually added to peerDependencies', () => {
          expect(showBar).to.have.property('manuallyAddedDependencies');
          expect(showBar.manuallyAddedDependencies).to.have.property('peerDependencies');
          expect(showBar.manuallyAddedDependencies.peerDependencies).to.deep.equal(['chai@2.4']);
        });
      });
      describe('adding a package with version that does not exist in package.json', () => {
        let showBar;
        before(() => {
          helper.reInitLocalScope();
          helper.createComponentBarFoo("import chai from 'chai';");
          helper.addComponentBarFoo();
          const overrides = {
            'bar/foo': {
              peerDependencies: {
                chai: '2.4'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar/foo');
        });
        it('should add the specified package to peerDependencies', () => {
          expect(Object.keys(showBar.peerPackageDependencies)).to.have.lengthOf(1);
          expect(showBar.peerPackageDependencies).to.deep.equal({ chai: '2.4' });
        });
        it('should show the package as manually added to peerDependencies', () => {
          expect(showBar).to.have.property('manuallyAddedDependencies');
          expect(showBar.manuallyAddedDependencies).to.have.property('peerDependencies');
          expect(showBar.manuallyAddedDependencies.peerDependencies).to.deep.equal(['chai@2.4']);
        });
      });
      describe('adding a package without version that does not exist in package.json', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.createComponentBarFoo("import chai from 'chai';");
          helper.addComponentBarFoo();
          const overrides = {
            'bar/foo': {
              peerDependencies: {
                chai: '+'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
        });
        it('should throw an error', () => {
          const output = helper.runWithTryCatch('bit show bar/foo');
          expect(output).to.have.string('unable to manually add the dependency "chai" into "bar/foo"');
        });
      });
      describe('adding a component with a version', () => {
        let showBar;
        before(() => {
          helper.setNewLocalAndRemoteScopes();
          helper.createFile('', 'bar.js');
          helper.createFile('', 'foo.js');
          helper.addComponent('bar.js');
          helper.addComponent('foo.js');
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should show the component as manually added dependency', () => {
          expect(showBar.manuallyAddedDependencies.dependencies).to.deep.equal(['foo@0.0.1']);
        });
        it('should add the component to the dependencies array with an empty relativePaths', () => {
          expect(showBar.dependencies[0].id).to.equal('foo@0.0.1');
          expect(showBar.dependencies[0].relativePaths).to.deep.equal([]);
        });
        describe('tagging the components', () => {
          let catBar;
          before(() => {
            helper.tagAllComponents();
            catBar = helper.catComponent('bar@latest');
          });
          it('should save the overrides data into the scope', () => {
            expect(catBar).to.have.property('overrides');
            expect(catBar.overrides)
              .to.have.property('dependencies')
              .that.deep.equal({ [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1' });
          });
          it('should save the manually added dependency into dependencies', () => {
            expect(catBar.dependencies[0].id).to.deep.equal({ name: 'foo', version: '0.0.1' });
            expect(catBar.dependencies[0].relativePaths).to.deep.equal([]);
          });
          it('should save the manually added dependency into flattenedDependencies', () => {
            expect(catBar.flattenedDependencies[0]).to.deep.equal({ name: 'foo', version: '0.0.1' });
          });
          describe('importing the component', () => {
            let originalAuthorScope;
            before(() => {
              helper.exportAllComponents();
              originalAuthorScope = helper.cloneLocalScope();
              helper.reInitLocalScope();
              helper.addRemoteScope();
              helper.importComponent('bar');
            });
            it('should also import the manually added dependency', () => {
              const fooPath = path.join(helper.localScopePath, 'components/.dependencies/foo');
              expect(fooPath).to.be.a.directory();
            });
            it('should add the overrides data into package.json', () => {
              const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar'));
              expect(packageJson).to.have.property('bit');
              expect(packageJson.bit.overrides.dependencies).to.deep.equal({
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1'
              });
            });
            it('bit status should show a clean state', () => {
              const status = helper.status();
              expect(status).to.have.string(statusWorkspaceIsCleanMsg);
            });
            describe('removing the manually added dependency from the imported', () => {
              before(() => {
                const barPath = path.join(helper.localScopePath, 'components/bar');
                const packageJson = helper.readPackageJson(barPath);
                packageJson.bit.overrides.dependencies = {};
                helper.writePackageJson(packageJson, barPath);
              });
              it('bit diff should show the removed dependency', () => {
                const diff = helper.diff();
                expect(diff).to.have.string('--- Dependencies (0.0.1 original)');
                expect(diff).to.have.string('+++ Dependencies (0.0.1 modified)');
                expect(diff).to.have.string(`- [ ${helper.remoteScope}/foo@0.0.1 ]`);
                expect(diff).to.have.string('--- Overrides Dependencies (0.0.1 original)');
                expect(diff).to.have.string('+++ Overrides Dependencies (0.0.1 modified)');
                expect(diff).to.have.string(`- [ ${OVERRIDE_COMPONENT_PREFIX}foo@0.0.1 ]`);
              });
              describe('tagging, exporting the component and then re-import for original author', () => {
                before(() => {
                  helper.tagAllComponents();
                  helper.exportAllComponents();
                  helper.reInitLocalScope();
                  helper.getClonedLocalScope(originalAuthorScope);
                  helper.importComponent('bar');
                });
                it('bit status should show a clean state', () => {
                  const status = helper.status();
                  expect(status).to.have.string(statusWorkspaceIsCleanMsg);
                });
                it('should remove the added dependencies from consumer-config', () => {
                  const bitJson = helper.readBitJson();
                  expect(bitJson.overrides.bar.dependencies).to.be.empty;
                });
                it('should remove the dependency from the model', () => {
                  catBar = helper.catComponent('bar@0.0.2');
                  expect(catBar.dependencies).to.deep.equal([]);
                  expect(catBar.overrides.dependencies).to.deep.equal({});
                });
                it('bit show should have the manuallyAddedDependencies empty', () => {
                  showBar = helper.showComponentParsed('bar');
                  expect(showBar.manuallyAddedDependencies).to.deep.equal({});
                });
              });
            });
          });
        });
      });
      describe('adding a component without a version', () => {
        let showBar;
        before(() => {
          helper.setNewLocalAndRemoteScopes();
          helper.createFile('', 'bar.js');
          helper.createFile('', 'foo.js');
          helper.addComponent('bar.js');
          helper.addComponent('foo.js');
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '+'
              }
            }
          };
          helper.addOverridesToBitJson(overrides);
          showBar = helper.showComponentParsed('bar');
        });
        it('should show the component as manually added dependency', () => {
          expect(showBar.manuallyAddedDependencies.dependencies).to.deep.equal(['foo']);
        });
        it('should add the component to the dependencies array with an empty relativePaths', () => {
          expect(showBar.dependencies[0].id).to.equal('foo');
          expect(showBar.dependencies[0].relativePaths).to.deep.equal([]);
        });
        describe('tagging the components', () => {
          let catBar;
          before(() => {
            helper.tagAllComponents();
            catBar = helper.catComponent('bar@latest');
          });
          it('should save the overrides data into the scope', () => {
            expect(catBar).to.have.property('overrides');
            expect(catBar.overrides)
              .to.have.property('dependencies')
              .that.deep.equal({ [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '+' });
          });
          it('should save the manually added dependency into dependencies and resolve its version correctly', () => {
            expect(catBar.dependencies[0].id).to.deep.equal({ name: 'foo', version: '0.0.1' });
            expect(catBar.dependencies[0].relativePaths).to.deep.equal([]);
          });
          it('should save the manually added dependency into flattenedDependencies', () => {
            expect(catBar.flattenedDependencies[0]).to.deep.equal({ name: 'foo', version: '0.0.1' });
          });
        });
        describe('importing the component', () => {
          before(() => {
            helper.exportAllComponents();
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.importComponent('bar');
          });
          it('should also import the manually added dependency', () => {
            const fooPath = path.join(helper.localScopePath, 'components/.dependencies/foo');
            expect(fooPath).to.be.a.directory();
          });
          it('should add the overrides data into package.json', () => {
            const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar'));
            expect(packageJson).to.have.property('bit');
            expect(packageJson.bit.overrides.dependencies).to.deep.equal({ [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '+' });
          });
          it('bit status should show a clean state', () => {
            const status = helper.status();
            expect(status).to.have.string(statusWorkspaceIsCleanMsg);
          });
        });
      });
    });
    describe('override environments', () => {
      describe('default workspace compiler and different compilers for different components', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.createFile('bar', 'foo-default.js');
          helper.createFile('bar', 'foo1.js');
          helper.createFile('bar', 'foo2.js');
          helper.addComponent('bar/*');
          const bitJson = helper.readBitJson();
          bitJson.env = { compiler: 'my-scope/default-compiler@0.0.1' };
          bitJson.overrides = {
            foo1: {
              env: {
                compiler: 'my-scope/foo1-compiler@0.0.1'
              }
            },
            foo2: {
              env: {
                compiler: 'my-scope/foo2-compiler@0.0.1'
              }
            }
          };
          helper.writeBitJson(bitJson);
        });
        it('should set the compiler with no overrides to the workspace default', () => {
          const fooDefault = helper.showComponentParsed('foo-default');
          expect(fooDefault.compiler.name).to.equal('my-scope/default-compiler@0.0.1');
        });
        it('should set the components with overrides compilers with the appropriate compilers', () => {
          const foo1 = helper.showComponentParsed('foo1');
          const foo2 = helper.showComponentParsed('foo2');
          expect(foo1.compiler.name).to.equal('my-scope/foo1-compiler@0.0.1');
          expect(foo2.compiler.name).to.equal('my-scope/foo2-compiler@0.0.1');
        });
        describe('adding a compiler with minus sign to overrides', () => {
          before(() => {
            const overrides = {
              foo1: {
                env: {
                  compiler: '-'
                }
              },
              foo2: {
                env: {
                  compiler: 'my-scope/foo2-compiler@0.0.1'
                }
              }
            };
            helper.addOverridesToBitJson(overrides);
          });
          it('should remove the compiler to that component', () => {
            const foo1 = helper.showComponentParsed('foo1');
            expect(foo1.compiler).to.be.null;
          });
        });
        describe('adding "env" to overrides with no values', () => {
          before(() => {
            const overrides = {
              foo1: {
                env: {}
              },
              foo2: {
                env: {
                  compiler: 'my-scope/foo2-compiler@0.0.1'
                }
              }
            };
            helper.addOverridesToBitJson(overrides);
          });
          it('should not override the env to that component and should use the workspace default', () => {
            const foo1 = helper.showComponentParsed('foo1');
            expect(foo1.compiler.name).to.equal('my-scope/default-compiler@0.0.1');
          });
        });
      });
    });
    describe('ignoring files with originallySharedDir', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        const fooFixture = 'require("../utils/is-string");';
        helper.createFile('src/bar', 'foo.js', fooFixture);
        helper.createFile('src/utils', 'is-string.js');
        helper.addComponent('src/bar/foo.js');
        helper.addComponent('src/utils/is-string.js');
        const overrides = {
          foo: {
            dependencies: {
              [`${OVERRIDE_FILE_PREFIX}src/utils/*`]: '-'
            }
          }
        };
        helper.addOverridesToBitJson(overrides);
        helper.tagAllComponents();
        // intermediate step, make sure the dependency is-string is ignored
        const foo = helper.catComponent('foo@latest');
        expect(foo.dependencies).to.have.lengthOf(0);
        expect(Object.keys(foo.overrides.dependencies)).to.have.lengthOf(1);

        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('foo');
        // change the file to have it as modified.
        helper.createFile('components/foo/bar', 'foo.js', `${fooFixture}\n console.log('hello');`);
      });
      it('bit status should not show the component as missing dependencies', () => {
        const status = helper.status();
        expect(status).to.not.have.string(statusFailureMsg);
      });
      it('the originallySharedDir should take into account the overrides file', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap[`${helper.remoteScope}/foo@0.0.1`].originallySharedDir).to.equal('src');
        // without file overrides, the originallySharedDir is 'src/bar'.
      });
      it('should write the dependencies without the sharedDir', () => {
        const componentDir = path.join(helper.localScopePath, 'components/foo');
        const packageJson = helper.readPackageJson(componentDir);
        expect(packageJson.bit.overrides.dependencies).to.deep.equal({ 'file://utils/*': '-' });
      });
      describe('tagging the component', () => {
        before(() => {
          helper.tagAllComponents();
        });
        it('should add back the sharedDir into the overrides', () => {
          const catFoo = helper.catComponent(`${helper.remoteScope}/foo@latest`);
          expect(catFoo.overrides.dependencies).to.deep.equal({ 'file://src/utils/*': '-' });
        });
      });
    });
    describe('adding overrides data on consumer-config to imported component', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        const overrides = {
          'bar/*': {
            peerDependencies: {
              chai: '2.4.0'
            },
            env: {
              compiler: 'bit.env/my-special-compiler@0.0.1'
            }
          }
        };
        helper.addOverridesToBitJson(overrides);
        const bitJson = helper.readBitJson();
        bitJson.env = { compiler: 'bit.env/my-special-compiler2@0.0.1' };
        helper.writeBitJson(bitJson);
      });
      it('bit status should not show the component as modified', () => {
        const status = helper.status();
        expect(status).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('bit diff should not show any diff', () => {
        const diff = helper.diff('bar/foo');
        expect(diff).to.have.string('no diff');
      });
      it('bit show should not display any compiler', () => {
        const showBar = helper.showComponentParsed('bar/foo');
        expect(showBar.compiler).to.be.null;
      });
    });
    describe('override package.json values', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        const overrides = {
          'bar/*': {
            bin: 'my-bin-file.js'
          }
        };
        helper.addOverridesToBitJson(overrides);
      });
      it('bit show should show the overrides', () => {
        const show = helper.showComponentParsed('bar/foo');
        expect(show.overrides)
          .to.have.property('bin')
          .equal('my-bin-file.js');
      });
      describe('tag, export and import the component', () => {
        before(() => {
          helper.tagAllComponents();
          helper.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should write the values into package.json file', () => {
          const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
          expect(packageJson)
            .to.have.property('bin')
            .that.equals('my-bin-file.js');
        });
        it('should not show the component as modified', () => {
          const status = helper.status();
          expect(status).to.have.string(statusWorkspaceIsCleanMsg);
        });
        describe('changing the value in the package.json directly (not inside overrides)', () => {
          before(() => {
            const compDir = path.join(helper.localScopePath, 'components/bar/foo');
            const packageJson = helper.readPackageJson(compDir);
            packageJson.bin = 'my-new-file.js';
            helper.writePackageJson(packageJson, compDir);
          });
          it('should not show the component as modified', () => {
            const status = helper.status();
            expect(status).to.not.have.string('modified components');
          });
        });
        describe('changing the value in the package.json inside overrides', () => {
          before(() => {
            const compDir = path.join(helper.localScopePath, 'components/bar/foo');
            const packageJson = helper.readPackageJson(compDir);
            packageJson.bit.overrides.bin = 'my-new-file.js';
            helper.writePackageJson(packageJson, compDir);
          });
          it('should show the component as modified', () => {
            const status = helper.status();
            expect(status).to.have.string('modified components');
          });
          it('bit diff should show the field diff', () => {
            const diff = helper.diff('bar/foo');
            expect(diff).to.have.string('my-bin-file.js');
            expect(diff).to.have.string('my-new-file.js');
          });
        });
      });
    });
  });
  describe('basic validations', () => {
    before(() => {
      helper.reInitLocalScope();
    });
    describe('when overrides is not an object', () => {
      before(() => {
        const overrides = ['dependencies'];
        helper.addOverridesToBitJson(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides to be object, got array');
      });
    });
    describe('when overrides of a component is not an object', () => {
      before(() => {
        const overrides = {
          bar: 1234
        };
        helper.addOverridesToBitJson(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides.bar to be object, got number');
      });
    });
    describe('when an unrecognized field is added into overrides of a component', () => {
      before(() => {
        const overrides = {
          bar: {
            some_field: {}
          }
        };
        helper.addOverridesToBitJson(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.runWithTryCatch('bit list');
        expect(output).to.have.string('found an unrecognized field "some_field" inside "overrides.bar" property');
      });
    });
    describe('when a dependency field is not an object', () => {
      before(() => {
        const overrides = {
          bar: {
            dependencies: 1234
          }
        };
        helper.addOverridesToBitJson(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides.bar.dependencies to be object, got number');
      });
    });
    describe('when a dependency rule is not a string', () => {
      before(() => {
        const overrides = {
          foo: {
            dependencies: {
              bar: false
            }
          }
        };
        helper.addOverridesToBitJson(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides.foo.dependencies.bar to be string, got boolean');
      });
    });
  });
});
