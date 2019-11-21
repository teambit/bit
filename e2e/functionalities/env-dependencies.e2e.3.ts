import chai, { expect } from 'chai';
import * as path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import {
  statusFailureMsg,
  statusInvalidComponentsMsg,
  statusWorkspaceIsCleanMsg
} from '../../src/cli/commands/public-cmds/status-cmd';

chai.use(require('chai-fs'));

describe('environments with dependencies', function() {
  this.timeout(0);
  const helper = new Helper();
  const compilerId = 'compilers/webpack';
  let scopeBeforeTagging;
  before(() => {
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    const compiler = path.join('compilers', 'new-babel', 'compiler.js');
    helper.fixtures.copyFixtureFile(compiler);
    helper.command.addComponent('compiler.js', {
      i: compilerId
    });
    helper.scopeHelper.reInitEnvsScope();
    helper.scopeHelper.addRemoteEnvironment();
    helper.npm.addNpmPackage('babel-core', '6.26.3');
    helper.npm.addNpmPackage('fs-extra', '5.0.0');
    helper.npm.addNpmPackage('mocha', '5.1.1');
    helper.npm.addNpmPackage('vinyl', '2.1.0');
    helper.npm.addNpmPackage('resolve', '1.7.1');
    helper.command.tagAllComponents();
    helper.command.exportAllComponents(helper.scopes.env);
    helper.scopeHelper.reInitLocalScope();
    helper.scopeHelper.addRemoteScope();
    helper.npm.initNpm();
    helper.scopeHelper.addRemoteEnvironment();
    helper.env.importCompiler(`${helper.scopes.env}/${compilerId}`);
    helper.fixtures.copyFixtureFile(path.join('compilers', 'webpack', 'base.config.js'));
    helper.fixtures.copyFixtureFile(path.join('compilers', 'webpack', 'dev.config.js'));
    helper.npm.addNpmPackage('webpack-merge', '4.1.4');
    helper.npm.addNpmPackage('webpack', '4.16.5');
    helper.fixtures.createComponentBarFoo();
    helper.fixtures.addComponentBarFoo();
    scopeBeforeTagging = helper.scopeHelper.cloneLocalScope();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when a dependency file is not included in bit.json', () => {
    before(() => {
      helper.bitJson.addFileToEnv(undefined, 'dev.config.js', './dev.config.js', 'compiler');
    });
    it('should show the dependency file as untracked', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.have.string(statusFailureMsg);
      expect(output).to.have.string('untracked');
      expect(output).to.have.string('dev.config.js -> base.config.js');
    });
  });
  describe('when a dependency file is not in the file system', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(scopeBeforeTagging);
      helper.fs.deletePath('base.config.js');
      helper.bitJson.addFileToEnv(undefined, 'base.config.js', './base.config.js', 'compiler');
      helper.bitJson.addFileToEnv(undefined, 'dev.config.js', './dev.config.js', 'compiler');
    });
    it('should show the component as an invalid component', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.have.string(statusInvalidComponentsMsg);
      expect(output).to.have.string('extension file is missing');
    });
  });
  describe('when all files exist and included in bit.json', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(scopeBeforeTagging);
      helper.bitJson.addFileToEnv(undefined, 'base.config.js', './base.config.js', 'compiler');
      helper.bitJson.addFileToEnv(undefined, 'dev.config.js', './dev.config.js', 'compiler');
    });
    it('bit status should not show any missing', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string(statusFailureMsg);
      expect(output).to.not.have.string(statusInvalidComponentsMsg);
    });
  });
  describe('when a dependency file is a Bit component', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(scopeBeforeTagging);
      helper.bitJson.addFileToEnv(undefined, 'dev.config.js', './dev.config.js', 'compiler');

      helper.npm.addNpmPackage('webpack', '4.16.4');
      helper.command.addComponent('base.config.js', { i: 'webpack/base' });
    });
    it('bit status should not show any missing', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string(statusFailureMsg);
      expect(output).to.not.have.string(statusInvalidComponentsMsg);
    });
    it('bit show should show compiler dependency', () => {
      const showJson = helper.command.showComponentParsed('bar/foo');
      expect(showJson)
        .to.have.property('compilerDependencies')
        .that.is.an('array');
      expect(showJson.compilerDependencies).to.have.lengthOf(1);
      const envDependency = showJson.compilerDependencies[0];
      expect(envDependency.id).to.equal('webpack/base');
    });
    it('bit show should show compiler package dependency', () => {
      const showJson = helper.command.showComponentParsed('bar/foo');
      expect(showJson).to.have.property('compilerPackageDependencies');
      expect(showJson.compilerPackageDependencies).to.have.property('devDependencies');
      expect(showJson.compilerPackageDependencies.devDependencies).to.have.property('webpack-merge');
    });
    describe('after tagging the components', () => {
      let catComponent;
      before(() => {
        const output = helper.command.tagAllComponents();
        expect(output).to.have.string('2 component(s) tagged');
        catComponent = helper.command.catComponent('bar/foo@latest');
      });
      it('should save the compilerDependencies in the model', () => {
        expect(catComponent).to.have.property('compilerDependencies');
        expect(catComponent.compilerDependencies).to.have.lengthOf(1);
        const envDependency = catComponent.compilerDependencies[0];
        expect(envDependency.id.name).to.equal('webpack/base');
        expect(envDependency.id.version).to.equal('0.0.1');
        expect(envDependency.relativePaths).to.have.lengthOf(1);
        const relativePath = envDependency.relativePaths[0];
        expect(relativePath.sourceRelativePath).to.equal('base.config.js');
        expect(relativePath.destinationRelativePath).to.equal('base.config.js');
      });
      it('should save the flattenedCompilerDependencies in the model', () => {
        expect(catComponent).to.have.property('flattenedCompilerDependencies');
        expect(catComponent.flattenedCompilerDependencies).to.have.lengthOf(1);
        const flattenedCompilerDependency = catComponent.flattenedCompilerDependencies[0];
        expect(flattenedCompilerDependency.name).to.equal('webpack/base');
        expect(flattenedCompilerDependency.version).to.equal('0.0.1');
      });
      describe('importing the component to another scope', () => {
        let scopeAfterImport;
        before(() => {
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteEnvironment();
          helper.command.importComponent('bar/foo');
          scopeAfterImport = helper.scopeHelper.cloneLocalScope();
        });
        it('should also import the environment component', () => {
          const output = helper.command.listLocalScope('--scope');
          expect(output).to.have.string('webpack/base');
        });
        it('should not show the component as modified', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
        it('should generate the links for environment components', () => {
          const linkFile = path.join(helper.scopes.localPath, 'components/bar/foo/base.config.js');
          expect(linkFile).to.be.a.file();
        });
        it('package.json should contain the env name with the files', () => {
          const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
          expect(packageJson.bit.env.compiler)
            .to.be.an('object')
            .with.property(`${helper.scopes.env}/compilers/webpack@0.0.1`)
            .that.has.property('files');
        });
        // @todo: skipped temporarily, failed on Windows for some reason.
        describe.skip('ejecting the environment configuration to component dir', () => {
          before(() => {
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.command.ejectConf('bar/foo');
          });
          it('still should not show the component as modified', () => {
            const output = helper.command.runCmd('bit status');
            expect(output).to.have.string(statusWorkspaceIsCleanMsg);
          });
        });
        // @todo: this has been skipped temporarily since the change of overriding envs via package.json, see PR #1576
        describe.skip('ejecting the environment configuration to a directory outside the component dir', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.command.ejectConf('bar/foo -p my-conf-dir');
          });
          it('still should not show the component as modified', () => {
            const output = helper.command.runCmd('bit status');
            expect(output).to.have.string(statusWorkspaceIsCleanMsg);
          });
        });
        // @todo: this has been skipped temporarily since the change of overriding envs via package.json, see PR #1576
        describe.skip('ejecting the environment configuration to a an inner component dir directory', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.command.ejectConf('bar/foo -p {COMPONENT_DIR}/my-inner-dir');
          });
          it('still should not show the component as modified', () => {
            const output = helper.command.runCmd('bit status');
            expect(output).to.have.string(statusWorkspaceIsCleanMsg);
          });
        });
        describe('importing with --conf flag', () => {
          const componentDir = path.join(helper.scopes.localPath, 'components/bar/foo');
          const linkFile = path.join(componentDir, 'base.config.js');
          const configurationFile = path.join(componentDir, 'dev.config.js');
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
            helper.command.importComponent('bar/foo --conf');
          });
          it('should not show the component as modified', () => {
            const output = helper.command.runCmd('bit status');
            expect(output).to.have.string(statusWorkspaceIsCleanMsg);
          });
          it('should generate the links for environment component', () => {
            expect(linkFile).to.be.a.file();
          });
          describe('injecting the configuration back', () => {
            before(() => {
              // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
              helper.command.injectConf('bar/foo');
            });
            it('should remove not only the configuration files but also the generated links', () => {
              expect(configurationFile).to.not.be.a.path();
              expect(linkFile).to.not.be.a.path();
            });
          });
        });
        // @todo: this has been skipped temporarily since the change of overriding envs via package.json, see PR #1576
        describe.skip('importing with --conf [path] flag for saving the configuration files in another directory', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
            helper.command.importComponent('bar/foo --conf my-config-dir');
          });
          it('should not show the component as modified', () => {
            const output = helper.command.runCmd('bit status');
            expect(output).to.have.string(statusWorkspaceIsCleanMsg);
          });
          it('should generate the links for environment component', () => {
            const linkFile = path.join(helper.scopes.localPath, 'my-config-dir/base.config.js');
            expect(linkFile).to.be.a.file();
          });
          it('should not generate an extra link in the components dir', () => {
            const linkFile = path.join(helper.scopes.localPath, 'components/bar/foo/base.config.js');
            expect(linkFile).to.not.be.a.path();
          });
          describe('running inject-conf', () => {
            before(() => {
              // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
              helper.command.injectConf('bar/foo');
            });
            it('should delete not only the configuration files but also the link file', () => {
              const linkFile = path.join(helper.scopes.localPath, 'my-config-dir/base.config.js');
              expect(linkFile).to.not.be.a.path();
            });
          });
        });
      });
    });
  });
});
