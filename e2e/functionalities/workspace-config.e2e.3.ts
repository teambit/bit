import chai, { expect } from 'chai';
import * as path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import { statusFailureMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { MISSING_PACKAGES_FROM_OVERRIDES_LABEL } from '../../src/cli/templates/component-issues-template';
import { OVERRIDE_COMPONENT_PREFIX, OVERRIDE_FILE_PREFIX } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('workspace config', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when the config exists in both bit.json and package.json', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.npm.initNpm();
      const packageJson = helper.packageJson.read();
      packageJson.bit = {
        env: {},
        componentsDefaultDirectory: 'components/{name}',
        packageManager: 'npm',
      };
      helper.packageJson.write(packageJson);
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('when the config conflicts between bit.json and package.json', () => {
      before(() => {
        const bitJson = helper.bitJson.read();
        bitJson.componentsDefaultDirectory = 'customBitJson/{name}';
        helper.bitJson.write(bitJson);

        const packageJson = helper.packageJson.read();
        packageJson.bit.componentsDefaultDirectory = 'customPackageJson/{name}';
        helper.packageJson.write(packageJson);
      });
      it('should use the config from bit.json and not from package.json', () => {
        helper.command.importComponent('bar/foo');
        expect(path.join(helper.scopes.localPath, 'customBitJson')).to.be.a.directory();
        expect(path.join(helper.scopes.localPath, 'customPackageJson')).to.not.be.a.path();
      });
    });
    describe('when Bit writes config data', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.importComponent('bar/foo -c');
      });
      it('should write the config data to both bit.json and package.json', () => {
        const bitJson = helper.bitJson.read();
        expect(bitJson.env).to.have.property('compiler');
        expect(bitJson.env.compiler).to.equal(`${helper.scopes.remote}/bar/foo@0.0.1`);

        const packageJson = helper.packageJson.read();
        expect(packageJson.bit.env).to.have.property('compiler');
        expect(packageJson.bit.env.compiler).to.equal(`${helper.scopes.remote}/bar/foo@0.0.1`);
      });
    });
  });
  describe('overrides components', () => {
    describe('changing component dependencies versions', () => {
      let localScope;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('', 'foo.js');
        helper.fs.createFile('', 'bar.js', "require('./foo');");
        helper.command.addComponent('foo.js');
        helper.command.addComponent('bar.js');
        helper.command.tagAllComponents();
        helper.command.tagScope('2.0.0');
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      describe('from bit.json', () => {
        before(() => {
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
        });
        it('bit diff should show the tagged dependency version vs the version from overrides', () => {
          const diff = helper.command.diff('bar --verbose');
          expect(diff).to.have.string('- foo@2.0.0');
          expect(diff).to.have.string('+ foo@0.0.1');
        });
        it('should not duplicate the dependencies or add anything to the package dependencies', () => {
          const bar = helper.command.showComponentParsed('bar');
          expect(bar.dependencies).to.have.lengthOf(1);
          expect(Object.keys(bar.packageDependencies)).to.have.lengthOf(0);
        });
        describe('tagging the component', () => {
          before(() => {
            helper.command.tagAllComponents();
          });
          it('should save the overridden dependency version', () => {
            const bar = helper.command.catComponent('bar@latest');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            expect(bar.dependencies[0].id.version).to.equal('0.0.1');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            expect(bar.flattenedDependencies[0].version).to.equal('0.0.1');
          });
        });
      });
      describe('from package.json', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.fs.deletePath('bit.json');
          helper.npm.initNpm();
          helper.scopeHelper.initWorkspace();
          const packageJson = helper.packageJson.read();
          expect(packageJson).to.have.property('bit');
          packageJson.bit.overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1',
              },
            },
          };
          helper.packageJson.write(packageJson);
        });
        it('bit status should not delete "bit.overrides" property of package.json', () => {
          helper.command.status();
          const packageJson = helper.packageJson.read();
          expect(packageJson).to.have.property('bit');
          expect(packageJson.bit).to.have.property('overrides');
        });
        it('bit diff should show the tagged dependency version vs the version from overrides', () => {
          const diff = helper.command.diff('bar');
          expect(diff).to.have.string('- foo@2.0.0');
          expect(diff).to.have.string('+ foo@0.0.1');
        });
        describe('tagging the component', () => {
          before(() => {
            helper.command.tagAllComponents();
          });
          it('should save the overridden dependency version', () => {
            const bar = helper.command.catComponent('bar@latest');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            expect(bar.dependencies[0].id.version).to.equal('0.0.1');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            expect(bar.flattenedDependencies[0].version).to.equal('0.0.1');
          });
        });
      });
    });
    describe('changing packages dependencies versions', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo('require("chai");');
        helper.fixtures.addComponentBarFoo();
        helper.npm.addNpmPackage('chai', '2.2.0');
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '4.0.0',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('should show the overridden package version', () => {
        const bar = helper.command.showComponentParsed('bar/foo');
        expect(Object.keys(bar.packageDependencies)).to.have.lengthOf(1);
        expect(bar.packageDependencies).to.deep.equal({ chai: '4.0.0' });
      });
      describe('tagging the component', () => {
        before(() => {
          helper.command.tagAllComponents();
        });
        it('should save the overridden package version', () => {
          const bar = helper.command.catComponent('bar/foo@latest');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(bar.packageDependencies).to.deep.equal({ chai: '4.0.0' });
        });
      });
    });
    describe('ignoring files and components dependencies', () => {
      let scopeAfterAdding;
      let remoteScopeEmpty;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('foo-dir', 'foo1.js');
        helper.fs.createFile('foo-dir', 'foo2.js');
        helper.fs.createFile('bar-dir', 'bar.js', "require('../foo-dir/foo1'); require('../foo-dir/foo2'); ");
        helper.command.addComponent('foo-dir/foo1.js', { i: 'utils/foo/foo1' });
        helper.command.addComponent('foo-dir/foo2.js', { i: 'utils/foo/foo2' });
        helper.command.addComponent('bar-dir/bar.js', { i: 'bar' });
        helper.command.link();
        scopeAfterAdding = helper.scopeHelper.cloneLocalScope();
        remoteScopeEmpty = helper.scopeHelper.cloneRemoteScope();
      });
      describe('ignoring the component file altogether', () => {
        let showBar;
        before(() => {
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_FILE_PREFIX}bar-dir/bar.js`]: '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
        });
        it('should show a warning saying that this feature is deprecated', () => {
          const status = helper.command.status();
          expect(status).to.have.string(
            'warning: file overrides (using "file://") is deprecated and will be removed on the next major version'
          );
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
                [`${OVERRIDE_FILE_PREFIX}foo-dir/foo2.js`]: '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
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
            const showBarStr = helper.command.runCmd(
              'bit show bar --json',
              path.join(helper.scopes.localPath, 'bar-dir')
            );
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
                [`${OVERRIDE_FILE_PREFIX}foo-dir/*`]: '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
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
                  [`${OVERRIDE_COMPONENT_PREFIX}utils.foo.foo1`]: '-',
                },
              },
            };
            helper.bitJson.addOverrides(overrides);
          });
          it('should throw an error', () => {
            const showCmd = () => helper.command.showComponentParsed('bar');
            expect(showCmd).to.throw();
          });
        });
        describe('when requiring with module path', () => {
          let showBar;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterAdding);
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();
            helper.fs.createFile(
              'bar-dir',
              'bar.js',
              `require('@bit/${helper.scopes.remote}.utils.foo.foo1'); require('@bit/${helper.scopes.remote}.utils.foo.foo2'); `
            );
            const overrides = {
              bar: {
                dependencies: {
                  [`${OVERRIDE_COMPONENT_PREFIX}${helper.scopes.remote}.utils.foo.foo1`]: '-',
                },
              },
            };
            helper.bitJson.addOverrides(overrides);
            showBar = helper.command.showComponentParsed('bar');
          });
          it('should not add the removed dependency to the component', () => {
            expect(showBar.dependencies).to.have.lengthOf(1);
            expect(showBar.dependencies[0].id).to.not.equal('foo1');
          });
          it('should show the dependency component as ignored', () => {
            expect(showBar).to.have.property('manuallyRemovedDependencies');
            expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
            expect(showBar.manuallyRemovedDependencies.dependencies).to.include(
              `${helper.scopes.remote}/utils/foo/foo1`
            );
          });
        });
        describe('when adding the component as devDependency without removing it', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterAdding);
            helper.command.link();
            helper.scopeHelper.reInitRemoteScope();
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();
            helper.fs.createFile(
              'bar-dir',
              'bar.js',
              `require('@bit/${helper.scopes.remote}.utils.foo.foo1'); require('@bit/${helper.scopes.remote}.utils.foo.foo2'); `
            );
            const overrides = {
              bar: {
                devDependencies: {
                  [`${OVERRIDE_COMPONENT_PREFIX}${helper.scopes.remote}.utils.foo.foo1`]: '+',
                },
              },
            };
            helper.bitJson.addOverrides(overrides);
          });
          // todo: make a decision about the desired behavior. see #2061
          it.skip('should not show the component twice as dependency and as devDependencies', () => {
            const showBar = helper.command.showComponentParsed('bar');
            expect(showBar.dependencies).to.have.lengthOf(1);
          });
          it('should not allow tagging the component', () => {
            const tagFunc = () => helper.command.tagAllComponents();
            expect(tagFunc).to.throw('some dependencies are duplicated');
          });
        });
      });
      describe('ignoring a dependencies components by wildcards', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterAdding);
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}utils/foo/*`]: '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
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
          helper.fs.createFile(
            'bar-dir',
            'bar.js',
            "require('../foo-dir/foo1'); require('../foo-dir/foo2'); require('../foo-dir/foo3')"
          );

          // an intermediate step, make sure bit status shows the component with an issue of a missing file
          helper.command.linkAndRewire();
          const status = helper.command.status();
          expect(status).to.have.string(statusFailureMsg);

          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_FILE_PREFIX}foo-dir/foo3*`]: '-', // we don't enter the entire file foo-dir/foo3.js because the require string doesn't have the extension
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
        });
        it('bit status should not show the component as missing files', () => {
          const status = helper.command.status();
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
          helper.scopeHelper.getClonedLocalScope(scopeAfterAdding);
          helper.fs.createFile(
            'bar-dir',
            'bar.js',
            "require('../foo-dir/foo1'); require('../foo-dir/foo2'); require('@bit/bit.utils.is-string')"
          );

          // an intermediate step, make sure bit status shows the component with an issue of a missing file
          const status = helper.command.status();
          expect(status).to.have.string(statusFailureMsg);
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}bit.utils.is-string`]: '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
        });
        it('bit status should not show the component as missing component', () => {
          helper.command.linkAndRewire();
          const status = helper.command.status();
          expect(status).to.not.have.string(statusFailureMsg);
        });
        it('should show the component as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          // expect(showBar.manuallyRemovedDependencies.dependencies).to.include('bit.utils/is-string');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('@bit/bit.utils.is-string');
        });
      });
      describe('ignoring an existing component required as a package', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterAdding);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeEmpty);
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.fs.createFile(
            'bar-dir',
            'bar.js',
            `require('@bit/${helper.scopes.remote}.utils.foo.foo1'); require('../foo-dir/foo2');`
          );
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}utils/foo/foo1`]: '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
        });
        it('should ignore the specified component dependency', () => {
          expect(showBar.dependencies).to.have.lengthOf(1);
          expect(showBar.dependencies[0].id).to.have.string('foo2');
        });
        it('should show the component dependency as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include(`${helper.scopes.remote}/utils/foo/foo1`);
        });
      });
    });
    describe('ignoring packages dependencies', () => {
      describe('ignoring a missing package', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.fs.createFile('bar-dir', 'bar.js', "require('non-exist-package')");
          helper.command.addComponent('bar-dir/bar.js', { i: 'bar' });

          // an intermediate step, make sure bit status shows the component with an issue of a missing file
          const status = helper.command.status();
          expect(status).to.have.string(statusFailureMsg);
          const overrides = {
            bar: {
              dependencies: {
                'non-exist-package': '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
        });
        it('bit status should not show the component as missing packages', () => {
          const status = helper.command.status();
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
          helper.scopeHelper.reInitLocalScope();
          helper.npm.addNpmPackage('existing-package');
          helper.npm.addNpmPackage('another-existing-package');
          helper.fs.createFile(
            'bar-dir',
            'bar.js',
            "require('existing-package'); require('another-existing-package');"
          );
          helper.command.addComponent('bar-dir/bar.js', { i: 'bar' });
          const overrides = {
            bar: {
              dependencies: {
                'existing-package': '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
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
          helper.scopeHelper.reInitLocalScope();
          helper.npm.addNpmPackage('existing-package');
          helper.npm.addNpmPackage('another-existing-package');
          helper.fs.createFile('bar-dir', 'bar.js');
          helper.fs.createFile(
            'bar-dir',
            'bar.spec.js',
            "require('existing-package'); require('another-existing-package');"
          );
          helper.command.addComponent('bar-dir/*', {
            i: 'bar',
            m: 'bar-dir/bar.js',
            t: 'bar-dir/bar.spec.js',
          });

          const overrides = {
            bar: {
              devDependencies: {
                'existing-package': '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
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
          helper.scopeHelper.reInitLocalScope();
          helper.fixtures.createComponentBarFoo("import chai from 'chai';");
          helper.npm.addNpmPackage('chai', '2.2.0');
          helper.packageJson.create({ peerDependencies: { chai: '>= 2.1.2 < 5' } });
          helper.fixtures.addComponentBarFoo();
          const overrides = {
            'bar/foo': {
              peerDependencies: {
                chai: '-',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar/foo');
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('', 'foo1.js');
        helper.fs.createFile('', 'foo2.js');
        helper.fs.createFile('', 'bar.js');
        helper.command.addComponent('foo1.js');
        helper.command.addComponent('foo2.js');
        helper.command.addComponent('bar.js');
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.fs.createFile(
          '',
          'bar.js',
          `require('@bit/${helper.scopes.remote}.foo1'); require('@bit/${helper.scopes.remote}.foo2');`
        );

        const overrides = {
          bar: {
            dependencies: {
              [`${OVERRIDE_COMPONENT_PREFIX}foo2`]: '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      describe('tagging the component', () => {
        let output;
        let catBar;
        before(() => {
          output = helper.general.runWithTryCatch('bit tag bar');
          catBar = helper.command.catComponent('bar@latest');
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
          const status = helper.command.status();
          expect(status).to.not.have.string('modified components');
        });
        describe('importing the component', () => {
          let barRoot;
          before(() => {
            barRoot = path.join(helper.scopes.localPath, 'components/bar/');
            helper.command.exportAllComponents();
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('bar');
          });
          it('should write the overrides data into the package.json of the component', () => {
            const packageJson = helper.packageJson.read(barRoot);
            expect(packageJson).to.have.property('bit');
            expect(packageJson.bit).to.have.property('overrides');
            expect(packageJson.bit.overrides).to.have.property('dependencies');
            expect(packageJson.bit.overrides.dependencies).to.have.property(`${OVERRIDE_COMPONENT_PREFIX}foo2`);
            expect(packageJson.bit.overrides.dependencies[`${OVERRIDE_COMPONENT_PREFIX}foo2`]).to.equal('-');
          });
          it('bit status should not show the component as modified', () => {
            helper.command.expectStatusToBeClean();
          });
          it('bit diff should not show any diff', () => {
            const diff = helper.command.diff('bar');
            expect(diff).to.have.string('no diff');
          });
          describe('changing the imported component to not ignore the dependency', () => {
            before(() => {
              const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/'));
              packageJson.bit.overrides.dependencies = {};
              helper.packageJson.write(packageJson, barRoot);
            });
            it('bit status should show the component as modified', () => {
              const status = helper.command.status();
              expect(status).to.have.string('modified components');
            });
            it('should show the previously ignored dependency as a missing component', () => {
              const status = helper.command.status();
              expect(status).to.have.string(statusFailureMsg);
              expect(status).to.have.string('missing components');
            });
            it('bit diff should show the overrides differences', () => {
              const diff = helper.command.diff('bar --verbose');
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo("import chai from 'chai';");
        helper.npm.addNpmPackage('chai', '2.2.0');
        helper.fixtures.addComponentBarFoo();
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        authorScope = helper.scopeHelper.cloneLocalScope();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        helper.npm.addNpmPackage('chai', '2.2.0');
        const componentDir = path.join(helper.scopes.localPath, 'components/bar/foo');
        const packageJson = helper.packageJson.read(componentDir);
        // an intermediate step to make sure we're good so far
        expect(packageJson.bit.overrides.dependencies).to.deep.equal({ chai: '-' });
        packageJson.bit.overrides.dependencies = {};
        helper.packageJson.write(packageJson, componentDir);
        // an intermediate step to make sure we're good so far
        const diff = helper.command.diff('--verbose');
        expect(diff).to.have.string('- [ chai@- ]');
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
      });
      it('should be saved into the model with an empty overrides', () => {
        const barFoo = helper.command.catComponent('bar/foo@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.overrides).to.have.property('dependencies');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.overrides.dependencies).to.be.empty;
      });
      it('should be saved into the model with the package in place', () => {
        const barFoo = helper.command.catComponent('bar/foo@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.packageDependencies).to.deep.equal({ chai: '2.2.0' });
      });
      describe('then, author re-import', () => {
        let scopeAfterReImport;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(authorScope);
          helper.command.importComponent('bar/foo');
          scopeAfterReImport = helper.scopeHelper.cloneLocalScope();
        });
        it('bit status should not show the component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        it('should save the new overrides to the consumer config', () => {
          const bitJson = helper.bitJson.read();
          expect(bitJson.overrides['bar/foo'].dependencies).to.be.empty;
        });
        describe('then author checkout to the first version', () => {
          before(() => {
            helper.command.checkoutVersion('0.0.1', 'bar/foo');
          });
          it('bit status should not show the component as modified', () => {
            const status = helper.command.status();
            expect(status).to.not.have.string('modified components');
          });
          it('should show the dependency as ignored', () => {
            const showBar = helper.command.showComponentParsed('bar/foo');
            expect(showBar).to.have.property('manuallyRemovedDependencies');
            expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
            expect(showBar.manuallyRemovedDependencies.dependencies).to.include('chai');
          });
          it('should save the overrides of the first version into consumer config', () => {
            const bitJson = helper.bitJson.read();
            expect(bitJson.overrides['bar/foo'].dependencies).to.not.be.empty;
            expect(bitJson.overrides['bar/foo'].dependencies).to.deep.equal({ chai: '-' });
          });
        });
        describe('then author merge the first version', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterReImport);
            helper.command.mergeVersion('0.0.1', 'bar/foo');
          });
          it('bit status should not show the component as modified', () => {
            const status = helper.command.status();
            expect(status).to.not.have.string('modified components');
          });
          it('should not show the dependency as ignored', () => {
            const showBar = helper.command.showComponentParsed('bar/foo');
            expect(showBar).to.have.property('manuallyRemovedDependencies');
            expect(showBar.manuallyRemovedDependencies).to.be.empty;
          });
          it('should not change the consumer config', () => {
            const bitJson = helper.bitJson.read();
            expect(bitJson.overrides['bar/foo'].dependencies).to.be.empty;
          });
        });
        describe('when the consumer config is saved also in the package.json file', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(authorScope);
            helper.npm.initNpm();
            const packageJson = helper.packageJson.read();
            packageJson.dependencies = { chai: '2.2.0' };
            packageJson.bit = {
              env: {},
              componentsDefaultDirectory: 'components/{name}',
              packageManager: 'npm',
            };
            helper.packageJson.write(packageJson);
            try {
              helper.command.importComponent('bar/foo --skip-npm-install');
            } catch (err) {
              // ignore. it shows an error because chai is missing, which is missing by purpose
            }
          });
          it('should still update bit.json', () => {
            const bitJson = helper.bitJson.read();
            expect(bitJson.overrides['bar/foo'].dependencies).to.be.empty;
          });
          it('should also update package.json', () => {
            const packageJson = helper.packageJson.read();
            expect(packageJson.bit.overrides['bar/foo'].dependencies).to.be.empty;
          });
        });
      });
    });
    describe('changing overrides of a component in consumer config after tag', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo("require('chai');");
        helper.npm.addNpmPackage('chai', '2.2.0');
        helper.fixtures.addComponentBarFoo();
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
        helper.command.tagAllComponents();
        const overridesChanged = {
          'bar/foo': {
            dependencies: {},
          },
        };
        helper.bitJson.addOverrides(overridesChanged);
      });
      it('bit status should show the component as modified', () => {
        const status = helper.command.status();
        expect(status).to.have.string('modified components');
      });
    });
    describe('changing order of the overrides dependencies after tag', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo("require('chai'); require('lodash')");
        helper.npm.addNpmPackage('chai', '2.2.0');
        helper.npm.addNpmPackage('lodash', '2.2.0');
        helper.fixtures.addComponentBarFoo();
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '-',
              lodash: '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
        helper.command.tagAllComponents();
        const overridesChangedOrder = {
          'bar/foo': {
            dependencies: {
              lodash: '-',
              chai: '-',
            },
          },
        };
        helper.bitJson.addOverrides(overridesChangedOrder);
      });
      it('bit status should not show the component as modified', () => {
        const status = helper.command.status();
        expect(status).to.not.have.string('modified components');
      });
    });
    describe('manually adding dependencies', () => {
      describe('moving a package from dependencies to peerDependencies', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.fixtures.createComponentBarFoo("import chai from 'chai';");
          helper.npm.addNpmPackage('chai', '2.2.0');
          helper.packageJson.create({ dependencies: { chai: '2.2.0' } });
          helper.fixtures.addComponentBarFoo();
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
          showBar = helper.command.showComponentParsed('bar/foo');
        });
        it('should ignore the specified package from dependencies', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(0);
        });
        it('should add the specified package to peerDependencies', () => {
          expect(Object.keys(showBar.peerPackageDependencies)).to.have.lengthOf(1);
          expect(showBar.peerPackageDependencies).to.deep.equal({ chai: '2.2.0' });
        });
        it('should show the package as ignored from dependencies', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('chai');
        });
        it('should show the package as manually added to peerDependencies', () => {
          expect(showBar).to.have.property('manuallyAddedDependencies');
          expect(showBar.manuallyAddedDependencies).to.have.property('peerDependencies');
          expect(showBar.manuallyAddedDependencies.peerDependencies).to.deep.equal(['chai@2.2.0']);
        });
      });
      describe('adding a package with version that does not exist in package.json', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.fixtures.createComponentBarFoo("import chai from 'chai';");
          helper.fixtures.addComponentBarFoo();
          const overrides = {
            'bar/foo': {
              peerDependencies: {
                chai: '2.2.0',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar/foo');
        });
        it('should add the specified package to peerDependencies', () => {
          expect(Object.keys(showBar.peerPackageDependencies)).to.have.lengthOf(1);
          expect(showBar.peerPackageDependencies).to.deep.equal({ chai: '2.2.0' });
        });
        it('should show the package as manually added to peerDependencies', () => {
          expect(showBar).to.have.property('manuallyAddedDependencies');
          expect(showBar.manuallyAddedDependencies).to.have.property('peerDependencies');
          expect(showBar.manuallyAddedDependencies.peerDependencies).to.deep.equal(['chai@2.2.0']);
        });
      });
      describe('adding a package without version that does not exist in package.json', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.fixtures.createComponentBarFoo("import chai from 'chai';");
          helper.fixtures.addComponentBarFoo();
          const overrides = {
            'bar/foo': {
              peerDependencies: {
                chai: '+',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
        });
        // See similar test in show.e2e - component with overrides data
        it('should not show the package in dependencies', () => {
          const output = helper.command.showComponent('bar/foo');
          expect(output).to.not.have.string('chai"');
        });
        // See similar test in status.e2e - when a component is created and added without its package dependencies
        it('should show a missing package in status', () => {
          const output = helper.command.status().replace(/\n/g, '');
          helper.command.expectStatusToHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
          expect(output).to.have.string('bar/foo.js -> chai');
          expect(output).to.have.string(`${MISSING_PACKAGES_FROM_OVERRIDES_LABEL} -> chai`);
        });
      });
      describe('adding a component with a version', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.setNewLocalAndRemoteScopes();
          helper.fs.createFile('', 'bar.js');
          helper.fs.createFile('', 'foo.js');
          helper.command.addComponent('bar.js');
          helper.command.addComponent('foo.js');
          helper.command.tagAllComponents();
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
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
            // with non-legacy mode, it complains about the missing foo@0.0.1 during the capsule write
            // this is fine. normally users use the version once the version created.
            helper.command.tagAllComponents();
            catBar = helper.command.catComponent('bar@latest');
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
            let afterImport;
            before(() => {
              helper.command.exportAllComponents();
              originalAuthorScope = helper.scopeHelper.cloneLocalScope();
              helper.scopeHelper.reInitLocalScope();
              helper.scopeHelper.addRemoteScope();
              helper.command.importComponent('bar');
              afterImport = helper.scopeHelper.cloneLocalScope();
            });
            it('should also import the manually added dependency', () => {
              const fooPath = path.join(helper.scopes.localPath, 'components/.dependencies/foo');
              expect(fooPath).to.be.a.directory();
            });
            it('should add the overrides data into package.json', () => {
              const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar'));
              expect(packageJson).to.have.property('bit');
              expect(packageJson.bit.overrides.dependencies).to.deep.equal({
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '0.0.1',
              });
            });
            it('bit status should show a clean state', () => {
              helper.command.expectStatusToBeClean();
            });
            describe('changing the component name in the overrides to a package syntax', () => {
              before(() => {
                const componentPackageJson = helper.packageJson.readComponentPackageJson('bar');
                componentPackageJson.bit.overrides.dependencies = {
                  [`${OVERRIDE_COMPONENT_PREFIX}${helper.scopes.remote}.foo`]: '0.0.1',
                };
                helper.packageJson.write(componentPackageJson, path.join(helper.scopes.localPath, 'components/bar'));
              });
              it('should not recognize the bit component as a package', () => {
                const show = helper.command.showComponentParsed('bar');
                expect(show.packageDependencies).to.deep.equal({});
                expect(show.dependencies).to.have.lengthOf(1);
              });
            });
            describe('removing the manually added dependency from the imported', () => {
              before(() => {
                helper.scopeHelper.getClonedLocalScope(afterImport);
                const barPath = path.join(helper.scopes.localPath, 'components/bar');
                const packageJson = helper.packageJson.read(barPath);
                packageJson.bit.overrides.dependencies = {};
                helper.packageJson.write(packageJson, barPath);
              });
              it('bit diff should show the removed dependency', () => {
                const diff = helper.command.diff('--verbose');
                expect(diff).to.have.string('--- dependencies 0.0.2 original');
                expect(diff).to.have.string('+++ dependencies 0.0.2 modified');
                expect(diff).to.have.string(`- ${helper.scopes.remote}/foo@0.0.1`);
                expect(diff).to.have.string('--- Overrides Dependencies (0.0.2 original)');
                expect(diff).to.have.string('+++ Overrides Dependencies (0.0.2 modified)');
                expect(diff).to.have.string(`- [ ${OVERRIDE_COMPONENT_PREFIX}foo@0.0.1 ]`);
              });
              describe('tagging, exporting the component and then re-import for original author', () => {
                before(() => {
                  helper.command.tagAllComponents();
                  helper.command.exportAllComponents();
                  helper.scopeHelper.reInitLocalScope();
                  helper.scopeHelper.getClonedLocalScope(originalAuthorScope);
                  helper.command.importComponent('bar');
                });
                it('bit status should show a clean state', () => {
                  helper.command.expectStatusToBeClean();
                });
                it('should remove the added dependencies from consumer-config', () => {
                  const bitJson = helper.bitJson.read();
                  expect(bitJson.overrides.bar.dependencies).to.be.empty;
                });
                it('should remove the dependency from the model', () => {
                  catBar = helper.command.catComponent('bar@0.0.3');
                  expect(catBar.dependencies).to.deep.equal([]);
                  expect(catBar.overrides.dependencies).to.deep.equal({});
                });
                it('bit show should have the manuallyAddedDependencies empty', () => {
                  showBar = helper.command.showComponentParsed('bar');
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
          helper.scopeHelper.setNewLocalAndRemoteScopes();
          helper.fs.createFile('', 'bar.js');
          helper.fs.createFile('', 'foo.js');
          helper.command.addComponent('bar.js');
          helper.command.addComponent('foo.js');
          const overrides = {
            bar: {
              dependencies: {
                [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '+',
              },
            },
          };
          helper.bitJson.addOverrides(overrides);
          showBar = helper.command.showComponentParsed('bar');
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
            helper.command.tagAllComponents();
            catBar = helper.command.catComponent('bar@latest');
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
            helper.command.exportAllComponents();
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('bar');
          });
          it('should also import the manually added dependency', () => {
            const fooPath = path.join(helper.scopes.localPath, 'components/.dependencies/foo');
            expect(fooPath).to.be.a.directory();
          });
          it('should add the overrides data into package.json', () => {
            const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar'));
            expect(packageJson).to.have.property('bit');
            expect(packageJson.bit.overrides.dependencies).to.deep.equal({ [`${OVERRIDE_COMPONENT_PREFIX}foo`]: '+' });
          });
          it('bit status should show a clean state', () => {
            helper.command.expectStatusToBeClean();
          });
        });
      });
    });
    describe('override environments', () => {
      describe('default workspace compiler and different compilers for different components', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.fs.createFile('bar', 'foo-default.js');
          helper.fs.createFile('bar', 'foo1.js');
          helper.fs.createFile('bar', 'foo2.js');
          helper.command.addComponent('bar/*');
          const bitJson = helper.bitJson.read();
          bitJson.env = { compiler: 'my-scope/default-compiler@0.0.1' };
          bitJson.overrides = {
            foo1: {
              env: {
                compiler: 'my-scope/foo1-compiler@0.0.1',
              },
            },
            foo2: {
              env: {
                compiler: 'my-scope/foo2-compiler@0.0.1',
              },
            },
          };
          helper.bitJson.write(bitJson);
        });
        it('should set the compiler with no overrides to the workspace default', () => {
          const fooDefault = helper.command.showComponentParsed('foo-default');
          expect(fooDefault.compiler.name).to.equal('my-scope/default-compiler@0.0.1');
        });
        it('should set the components with overrides compilers with the appropriate compilers', () => {
          const foo1 = helper.command.showComponentParsed('foo1');
          const foo2 = helper.command.showComponentParsed('foo2');
          expect(foo1.compiler.name).to.equal('my-scope/foo1-compiler@0.0.1');
          expect(foo2.compiler.name).to.equal('my-scope/foo2-compiler@0.0.1');
        });
        describe('adding a compiler with minus sign to overrides', () => {
          before(() => {
            const overrides = {
              foo1: {
                env: {
                  compiler: '-',
                },
              },
              foo2: {
                env: {
                  compiler: 'my-scope/foo2-compiler@0.0.1',
                },
              },
            };
            helper.bitJson.addOverrides(overrides);
          });
          it('should remove the compiler to that component', () => {
            const foo1 = helper.command.showComponentParsed('foo1');
            expect(foo1.compiler).to.be.null;
          });
        });
        describe('adding "env" to overrides with no values', () => {
          before(() => {
            const overrides = {
              foo1: {
                env: {},
              },
              foo2: {
                env: {
                  compiler: 'my-scope/foo2-compiler@0.0.1',
                },
              },
            };
            helper.bitJson.addOverrides(overrides);
          });
          it('should not override the env to that component and should use the workspace default', () => {
            const foo1 = helper.command.showComponentParsed('foo1');
            expect(foo1.compiler.name).to.equal('my-scope/default-compiler@0.0.1');
          });
        });
      });
    });
    // legacy test in order to check the originallySharedDir
    describe('ignoring files with originallySharedDir', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        const fooFixture = 'require("../utils/is-string");';
        helper.fs.createFile('src/bar', 'foo.js', fooFixture);
        helper.fs.createFile('src/utils', 'is-string.js');
        helper.command.addComponent('src/bar/foo.js');
        helper.command.addComponent('src/utils/is-string.js');
        const overrides = {
          foo: {
            dependencies: {
              [`${OVERRIDE_FILE_PREFIX}src/utils/*`]: '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
        helper.command.tagAllComponents();
        // intermediate step, make sure the dependency is-string is ignored
        const foo = helper.command.catComponent('foo@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(foo.dependencies).to.have.lengthOf(0);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(Object.keys(foo.overrides.dependencies)).to.have.lengthOf(1);

        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('foo');
        // change the file to have it as modified.
        helper.fs.createFile('components/foo/bar', 'foo.js', `${fooFixture}\n console.log('hello');`);
      });
      it('bit status should not show the component as missing dependencies', () => {
        const status = helper.command.status();
        expect(status).to.not.have.string(statusFailureMsg);
      });
      it('the originallySharedDir should take into account the overrides file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[`${helper.scopes.remote}/foo@0.0.1`].originallySharedDir).to.equal('src');
        // without file overrides, the originallySharedDir is 'src/bar'.
      });
      it('should write the dependencies without the sharedDir', () => {
        const componentDir = path.join(helper.scopes.localPath, 'components/foo');
        const packageJson = helper.packageJson.read(componentDir);
        expect(packageJson.bit.overrides.dependencies).to.deep.equal({ 'file://utils/*': '-' });
      });
      describe('tagging the component', () => {
        before(() => {
          helper.command.tagAllComponents();
        });
        it('should add back the sharedDir into the overrides', () => {
          const catFoo = helper.command.catComponent(`${helper.scopes.remote}/foo@latest`);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catFoo.overrides.dependencies).to.deep.equal({ 'file://src/utils/*': '-' });
        });
      });
    });
    describe('adding overrides data on consumer-config to imported component', () => {
      let overrides;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        overrides = {
          'bar/*': {
            peerDependencies: {
              chai: '2.2.0',
            },
            env: {
              compiler: 'bit.env/my-special-compiler@0.0.1',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
        const bitJson = helper.bitJson.read();
        bitJson.env = { compiler: 'bit.env/my-special-compiler2@0.0.1' };
        helper.bitJson.write(bitJson);
      });
      it('bit status should show the component as modified', () => {
        const status = helper.command.status();
        expect(status).to.have.string('modified');
      });
      it('bit diff should show the diff', () => {
        const diff = helper.command.diff('bar/foo');
        expect(diff).to.have.string('+ bit.env/my-special-compiler@0.0.1');
        expect(diff).to.have.string('+ chai@2.2.0');
      });
      it('bit show should show the settings from the workspace config', () => {
        const showBar = helper.command.showComponentParsed('bar/foo');
        expect(showBar.compiler.name).to.equal('bit.env/my-special-compiler@0.0.1');
        expect(showBar.overrides.peerDependencies).to.deep.equal({ chai: '2.2.0' });
      });
      describe('when the overrides data on consumer config excluded the imported component', () => {
        before(() => {
          overrides['bar/*'].exclude = [`${helper.scopes.remote}/*`];
          helper.bitJson.addOverrides(overrides);
        });
        it('bit status should not show the component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        it('bit diff should not show any diff', () => {
          const diff = helper.command.diff('bar/foo');
          expect(diff).to.have.string('no diff');
        });
        it('bit show should not display any compiler', () => {
          const showBar = helper.command.showComponentParsed('bar/foo');
          expect(showBar.compiler).to.be.null;
        });
      });
    });
    describe('override package.json values', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        const overrides = {
          'bar/*': {
            bin: 'my-bin-file.js',
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('bit show should show the overrides', () => {
        const show = helper.command.showComponentParsed('bar/foo');
        expect(show.overrides).to.have.property('bin').equal('my-bin-file.js');
      });
      describe('tag, export and import the component', () => {
        let authorScope;
        before(() => {
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          authorScope = helper.scopeHelper.cloneLocalScope();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('should write the values into package.json file', () => {
          const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
          expect(packageJson).to.have.property('bin').that.equals('my-bin-file.js');
        });
        it('should not show the component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        describe('changing the value in the package.json directly (not inside overrides)', () => {
          before(() => {
            const compDir = path.join(helper.scopes.localPath, 'components/bar/foo');
            const packageJson = helper.packageJson.read(compDir);
            packageJson.bin = 'my-new-file.js';
            helper.packageJson.write(packageJson, compDir);
          });
          it('should not show the component as modified', () => {
            const status = helper.command.status();
            expect(status).to.not.have.string('modified components');
          });
        });
        describe('changing the value in the package.json inside overrides', () => {
          before(() => {
            const compDir = path.join(helper.scopes.localPath, 'components/bar/foo');
            const packageJson = helper.packageJson.read(compDir);
            packageJson.bit.overrides.bin = 'my-new-file.js';
            helper.packageJson.write(packageJson, compDir);
          });
          it('should show the component as modified', () => {
            const status = helper.command.status();
            expect(status).to.have.string('modified components');
          });
          it('bit diff should show the field diff', () => {
            const diff = helper.command.diff('bar/foo --verbose');
            expect(diff).to.have.string('my-bin-file.js');
            expect(diff).to.have.string('my-new-file.js');
          });
          describe('tagging, exporting and re-importing as author', () => {
            before(() => {
              helper.command.tagAllComponents();
              helper.command.exportAllComponents();
              helper.scopeHelper.getClonedLocalScope(authorScope);
              helper.command.importComponent('bar/foo');
            });
            it('should not show the component as modified', () => {
              const status = helper.command.status();
              expect(status).to.not.have.string('modified components');
            });
            it('author bit.json should be rewritten to include a rule of the specific component', () => {
              const bitJson = helper.bitJson.read();
              expect(bitJson.overrides)
                .to.have.property(`${helper.scopes.remote}/bar/foo`)
                .that.deep.equals({ bin: 'my-new-file.js' });
            });
            it('bit show should display the modified field and not the original one', () => {
              const show = helper.command.showComponentParsed('bar/foo');
              expect(show.overrides).to.have.property('bin').that.equals('my-new-file.js');
            });
          });
        });
      });
    });
    describe('propagating from a specific rule to a more general rule when propagate field is true', () => {
      let show;
      let overrides;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.fs.outputFile('baz.js');
        helper.command.addComponent('baz.js');
        overrides = {
          '*': {
            scripts: {
              build: 'babel build',
            },
          },
          'bar/*': {
            bin: 'my-bin-file.js',
            scripts: {
              test: 'mocha test',
              lint: 'eslint lint',
            },
            propagate: true,
          },
          'bar/foo': {
            scripts: {
              test: 'jest test',
              watch: 'babel watch',
            },
            propagate: true,
          },
        };
        helper.bitJson.addOverrides(overrides);
        show = helper.command.showComponentParsed();
      });
      it('should not save the "propagate" field', () => {
        expect(show.overrides).to.not.have.property('propagate');
      });
      it('should propagate to a more general rule and save string values that are not in the specific rule', () => {
        expect(show.overrides).to.have.property('bin').that.equals('my-bin-file.js');
      });
      it('should propagate to a more general rule and merge objects that are in the specific rule', () => {
        expect(show.overrides).to.have.property('scripts');
        expect(show.overrides.scripts).to.have.property('build').that.equals('babel build');
        expect(show.overrides.scripts).to.have.property('lint').that.equals('eslint lint');
        expect(show.overrides.scripts).to.have.property('watch').that.equals('babel watch');
      });
      it('should let the more specific rule wins when it contradict a more general rule', () => {
        expect(show.overrides.scripts).to.have.property('test');
        expect(show.overrides.scripts.test).to.equals('jest test');
        expect(show.overrides.scripts.test).not.to.equals('mocha test');
      });
      describe('propagate with exclude', () => {
        before(() => {
          overrides['bar/*'].exclude = ['bar/foo'];
          helper.bitJson.addOverrides(overrides);
        });
        it('should consider the exclude prop and show the overrides accordingly', () => {
          const output = helper.command.showComponentParsed();
          expect(output.overrides).to.not.have.property('bin');
          expect(output.overrides).to.have.property('scripts');
          expect(output.overrides.scripts).to.have.property('build');
          expect(output.overrides.scripts).to.have.property('test');
          expect(output.overrides.scripts).to.have.property('watch');
          expect(output.overrides.scripts).to.not.have.property('lint');
        });
      });
      describe('tagging the components and then changing the propagate of one component', () => {
        before(() => {
          helper.command.tagAllComponents();
          const bitJson = helper.bitJson.read();
          bitJson.overrides['bar/foo'].propagate = false;
          helper.bitJson.write(bitJson);
        });
        it('should not affect other components that do not match any overrides criteria', () => {
          const status = helper.command.statusJson();
          expect(status.modifiedComponent).to.not.include('baz@0.0.1');
        });
      });
    });
    describe('using "exclude" to exclude component from a rule', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
      });
      describe('exclude with an exact id', () => {
        before(() => {
          const overrides = {
            '*': {
              bin: 'my-bin-file.js',
              exclude: ['bar/foo'],
            },
          };
          helper.bitJson.addOverrides(overrides);
        });
        it('should exclude the excluded component from the overrides value', () => {
          const show = helper.command.showComponentParsed('bar/foo');
          expect(show.overrides).to.not.have.property('bin');
        });
      });
      describe('exclude with an wildcards', () => {
        before(() => {
          const overrides = {
            '*': {
              bin: 'my-bin-file.js',
              exclude: ['bar/*'],
            },
          };
          helper.bitJson.addOverrides(overrides);
        });
        it('should exclude the excluded component from the overrides value', () => {
          const show = helper.command.showComponentParsed('bar/foo');
          expect(show.overrides).to.not.have.property('bin');
        });
      });
    });
  });
  describe('basic validations', () => {
    describe('when overrides is not an object', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const overrides = ['dependencies'];
        helper.bitJson.addOverrides(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides to be object, got array');
      });
    });
    describe('when overrides of a component is not an object', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const overrides = {
          bar: 1234,
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides.bar to be object, got number');
      });
    });
    describe('when a forbidden field is added into overrides of a component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const overrides = {
          bar: {
            name: 'foo', // the name field of package.json is not permitted to change
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit list');
        expect(output).to.have.string('found a forbidden field "name" inside "overrides.bar" property');
      });
    });
    describe('when a non-compliant package.json field is added into overrides of a component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        const overrides = {
          'bar/*': {
            private: 'foo', // according to npm specs it should be boolean
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('bit tag should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit tag -a');
        expect(output).to.have.string(
          'unable to save Version object of "bar/foo@0.0.1", "overrides.private" is a package.json field but is not compliant with npm requirements. Type for field private, was expected to be boolean, not string'
        );
      });
    });
    describe('when a dependency field is not an object', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const overrides = {
          bar: {
            dependencies: 1234,
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides.bar.dependencies to be object, got number');
      });
    });
    describe('when a dependency rule is not a string', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const overrides = {
          foo: {
            dependencies: {
              bar: false,
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides.foo.dependencies.bar to be string, got boolean');
      });
    });
    describe('when "exclude" prop that is not an array', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const overrides = {
          '*': {
            exclude: 'bar',
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('any bit command should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit list');
        expect(output).to.have.string('expected overrides.*.exclude to be array, got string');
      });
    });
  });
  describe('export a component with compiler then import', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.env.importDummyCompiler();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.command.importComponent('bar/foo');
    });
    it('should not add the component into the overrides of the workspace because nothing has changed', () => {
      const bitJson = helper.bitJson.read();
      expect(bitJson).to.not.have.property('overrides');
    });
  });
});
