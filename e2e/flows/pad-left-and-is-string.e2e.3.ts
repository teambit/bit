import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { failureEjectMessage } from '../../src/cli/templates/eject-template';
import Helper, { FileStatusWithoutChalk } from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));
// legacy test as it tests lots of the originallySharedDir functionality
describe('a flow with two components: is-string and pad-left, where is-string is a dependency of pad-left', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when originallySharedDir is the same as dist.entry (src)', () => {
    let originalScope;
    let scopeBeforeTag;
    let scopeBeforeExport;
    let scopeBeforeImport;
    let scopeAfterImport;
    let remoteScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const sourceDir = path.join(helper.fixtures.getFixturesDir(), 'components');
      const destination = path.join(helper.scopes.localPath, 'src');
      fs.copySync(path.join(sourceDir, 'is-string'), path.join(destination, 'is-string'));
      fs.copySync(path.join(sourceDir, 'pad-left'), path.join(destination, 'pad-left'));

      helper.command.addComponent('src/is-string -t src/is-string/is-string.spec.js -i string/is-string');
      helper.command.addComponent('src/pad-left -t src/pad-left/pad-left.spec.js -i string/pad-left');

      helper.env.importCompiler();
      helper.env.importTester();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
      helper.command.runCmd('npm init -y');
      helper.command.runCmd('npm install chai -D');
      scopeBeforeTag = helper.scopeHelper.cloneLocalScope();
      helper.command.tagAllComponents();
      scopeBeforeExport = helper.scopeHelper.cloneLocalScope();
      helper.command.exportAllComponents();

      originalScope = helper.scopeHelper.cloneLocalScope();
      remoteScope = helper.scopeHelper.cloneRemoteScope();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteEnvironment();
      helper.scopeHelper.addGlobalRemoteScope();
      scopeBeforeImport = helper.scopeHelper.cloneLocalScope();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
      helper.command.importComponent('string/pad-left -p src/pad-left');
      scopeAfterImport = helper.scopeHelper.cloneLocalScope();
    });
    it('should be able to run the tests', () => {
      const output = helper.command.testComponent('string/pad-left');
      expect(output).to.have.string('tests passed');
    });
    it('should save the paths in the model as Linux format', () => {
      const isString = helper.command.catComponent(`${helper.scopes.remote}/string/is-string@latest`);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(isString.docs[0].filePath).to.equal('src/is-string/is-string.js');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(isString.specsResults[0].specFile).to.equal('is-string/is-string.spec.js');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      isString.dists.forEach((dist) => expect(dist.relativePath.startsWith('src/is-string')).to.be.true);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      isString.files.forEach((file) => expect(file.relativePath.startsWith('src/is-string')).to.be.true);
    });
    describe('changing to absolute syntax and tagging', () => {
      before(() => {
        const padLeftFile = path.join(helper.scopes.localPath, 'src', 'pad-left', 'pad-left', 'pad-left.js');
        const padLeftContent = fs.readFileSync(padLeftFile).toString();
        const relativeSyntax = '../is-string/is-string';
        const absoluteSyntax = helper.general.getRequireBitPath('string', 'is-string');
        fs.outputFileSync(padLeftFile, padLeftContent.replace(relativeSyntax, absoluteSyntax));

        // an intermediate step, make sure, bit-diff is not throwing an error
        const diffOutput = helper.command.diff();
        expect(diffOutput).to.have.string("-import isString from '../is-string/is-string';");
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
      });
      it('should not add both originallySharedDir and dist.entry because they are the same', () => {
        const padLeftModel = helper.command.catComponent(`${helper.scopes.remote}/string/pad-left@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        padLeftModel.dists.forEach((dist) => expect(dist.relativePath.startsWith('src/pad-left')).to.be.true);
      });
      it('should not add the dist.entry if it was not removed before', () => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteEnvironment();
        helper.scopeHelper.addGlobalRemoteScope();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        helper.bitJson.modifyField('dist', { target: 'dist', entry: 'any' });
        helper.command.importComponent('string/pad-left -p src/pad-left');
        helper.command.tagComponent('string/pad-left', 'msg', '-f');
        const padLeftModel = helper.command.catComponent(`${helper.scopes.remote}/string/pad-left@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        padLeftModel.dists.forEach((dist) => expect(dist.relativePath.startsWith('src/pad-left')).to.be.true);
      });
      describe('importing back to the original repo', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(originalScope);
          helper.command.importComponent('string/pad-left');
        });
        it('should be able to pass the tests', () => {
          const output = helper.command.testComponent('string/pad-left');
          expect(output).to.have.string('tests passed');
        });
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)('eject components to a registry', () => {
        let exportOutput;
        let ejectOutput;
        let npmCiRegistry: NpmCiRegistry;
        before(async () => {
          npmCiRegistry = new NpmCiRegistry(helper);
          await npmCiRegistry.init();
          helper.scopeHelper.getClonedLocalScope(scopeBeforeTag);
          helper.scopeHelper.reInitRemoteScope();
          npmCiRegistry.setCiScopeInBitJson();
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteEnvironment();
          helper.scopeHelper.addGlobalRemoteScope();
          npmCiRegistry.setCiScopeInBitJson();
          helper.command.importComponent('string/is-string');
          helper.command.importComponent('string/pad-left');
          helper.command.tagScope('2.0.0', 'msg', '-a');

          // as an intermediate step, make sure bit status doesn't show them as modified
          // it's a very important step which covers a few bugs
          const output = helper.command.runCmd('bit status');
          expect(output).to.not.have.string('modified');

          exportOutput = helper.command.exportAllComponents();

          helper.scopeHelper.removeRemoteScope();
          npmCiRegistry.publishComponent('string/is-string', '2.0.0');
          npmCiRegistry.publishComponent('string/pad-left', '2.0.0');

          ejectOutput = helper.command.ejectComponents('string/is-string string/pad-left');
        });
        after(() => {
          npmCiRegistry.destroy();
        });
        it('should export them successfully', () => {
          expect(exportOutput).to.have.string('exported 2 components to scope');
        });
        it('should eject them successfully', () => {
          expect(ejectOutput).to.not.have.string(failureEjectMessage);
        });
        it('should delete the original component files from the file-system', () => {
          expect(path.join(helper.scopes.localPath, 'components/string/is-string')).not.to.be.a.path();
          expect(path.join(helper.scopes.localPath, 'components/string/pad-left')).not.to.be.a.path();
        });
        it('should update the package.json with the components as packages', () => {
          const packageJson = helper.packageJson.read();
          expect(packageJson.dependencies[`@ci/${helper.scopes.remote}.string.is-string`]).to.equal('2.0.0');
          expect(packageJson.dependencies[`@ci/${helper.scopes.remote}.string.pad-left`]).to.equal('2.0.0');
        });
        it('should have the component files as a package (in node_modules)', () => {
          const nodeModulesDir = path.join(helper.scopes.localPath, 'node_modules', '@ci');
          expect(path.join(nodeModulesDir, `${helper.scopes.remote}.string.is-string`)).to.be.a.path();
          expect(path.join(nodeModulesDir, `${helper.scopes.remote}.string.pad-left`)).to.be.a.path();
        });
        it('should delete the component from bit.map', () => {
          const bitMap = helper.bitMap.read();
          Object.keys(bitMap).forEach((id) => {
            expect(id).not.to.have.string('pad-left');
            expect(id).not.to.have.string('is-string');
          });
        });
      });
    });
    describe('changing to custom module resolutions', () => {
      let originalScopeWithCustomResolve;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeExport);
        helper.scopeHelper.reInitRemoteScope();
        const padLeftFile = path.join(helper.scopes.localPath, 'src', 'pad-left', 'pad-left.js');
        const padLeftContent = fs.readFileSync(padLeftFile).toString();
        const relativeSyntax = '../is-string/is-string';
        const customSyntax = 'is-string';
        fs.outputFileSync(padLeftFile, padLeftContent.replace(relativeSyntax, customSyntax));
        const bitJson = helper.bitJson.read();
        bitJson.resolveModules = { modulesDirectories: ['src'] };
        helper.bitJson.write(bitJson);

        // an intermediate step, make sure, bit-diff is not throwing an error
        const diffOutput = helper.command.diff();
        expect(diffOutput).to.have.string("-import isString from '../is-string/is-string';");
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        originalScopeWithCustomResolve = helper.scopeHelper.cloneLocalScope();
      });
      it('should not add both originallySharedDir and dist.entry because they are the same', () => {
        const padLeftModel = helper.command.catComponent(`${helper.scopes.remote}/string/pad-left@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        padLeftModel.dists.forEach((dist) => expect(dist.relativePath.startsWith('src/pad-left')).to.be.true);
      });
      it('should indicate that the dependency used custom-module-resolution', () => {
        const padLeftModel = helper.command.catComponent(`${helper.scopes.remote}/string/pad-left@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const relativePath = padLeftModel.dependencies[0].relativePaths[0];
        expect(relativePath).to.have.property('isCustomResolveUsed');
        expect(relativePath).to.have.property('importSource');
        expect(relativePath.importSource).to.equal('is-string');
      });
      describe('importing the component to another repo', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteEnvironment();
          helper.scopeHelper.addGlobalRemoteScope();
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
          helper.command.importComponent('string/pad-left -p src/pad-left');
        });
        it('should not show the component as modified when imported', () => {
          const status = helper.command.runCmd('bit status');
          expect(status).to.not.have.string('modified');
        });
        describe('changing the component', () => {
          before(() => {
            const padLeftFile = path.join(helper.scopes.localPath, 'src', 'pad-left', 'pad-left.js');
            const padLeftContent = fs.readFileSync(padLeftFile).toString();
            fs.outputFileSync(padLeftFile, `${padLeftContent}\n`);

            // intermediate step, make sure the component is modified
            const status = helper.command.runCmd('bit status');
            expect(status).to.have.string('modified');
          });
          it('should be able to pass the tests', () => {
            const output = helper.command.testComponent('string/pad-left');
            expect(output).to.have.string('tests passed');
          });
          describe('tag and export, then import back to the original repo', () => {
            before(() => {
              helper.command.tagAllComponents();
              helper.command.exportAllComponents();
              helper.scopeHelper.getClonedLocalScope(originalScopeWithCustomResolve);
              helper.command.importComponent('string/pad-left');
            });
            it('should not show the component as modified when imported', () => {
              const status = helper.command.runCmd('bit status');
              expect(status).to.not.have.string('modified');
            });
            it('should be able to pass the tests', () => {
              // we must add NODE_PATH=dist for the author to workaround its environment as if it
              // has custom-module-resolution set. In the real world, the author has babel or
              // webpack configured to have "src" as the module resolved directory
              let output;
              if (process.platform === 'win32') {
                output = helper.command.runCmd('set "NODE_PATH=dist" && bit test string/pad-left');
              } else {
                output = helper.command.runCmd('NODE_PATH=dist bit test string/pad-left');
              }
              expect(output).to.have.string('tests passed');
            });
          });
        });
      });
    });
    describe('merge conflict scenario', () => {
      let output;
      let localConsumerFiles;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(originalScope);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        const padLeftPath = path.join(helper.scopes.localPath, 'src/pad-left/pad-left.js');
        fs.appendFileSync(padLeftPath, '\n console.log("modified");');
        helper.command.tagAllComponents('--force'); // 0.0.2
        helper.command.exportAllComponents();

        helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
        const padLeftPathImported = path.join(helper.scopes.localPath, 'src/pad-left/pad-left/pad-left.js');
        fs.appendFileSync(padLeftPathImported, '\n console.log("imported-modified");');
        helper.command.tagAllComponents('--force');
        try {
          helper.command.exportAllComponents();
        } catch (err) {
          expect(err.toString()).to.have.string('conflict');
        }

        helper.command.runCmd('bit untag string/pad-left 0.0.2'); // current state: 0.0.1 + modification
        helper.command.importComponent('string/pad-left --objects');
        output = helper.command.checkoutVersion('0.0.2', 'string/pad-left', '--manual');
        localConsumerFiles = helper.fs.getConsumerFiles();
      });
      it('bit-use should not add any file', () => {
        expect(output).to.not.have.string(FileStatusWithoutChalk.added);
      });
      it('bit-use should update the same files and not create duplications', () => {
        expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/index.js'));
        expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/pad-left.js'));
        expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/pad-left.spec.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left/index.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left/pad-left.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left/pad-left.spec.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/index.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left.spec.js'));
      });
    });
    describe('merge command', () => {
      let mergeCommandScope;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.testComponent('string/pad-left');
        fs.appendFileSync(
          path.join(helper.scopes.localPath, 'src/pad-left/pad-left/pad-left.js'),
          '\n console.log("modified");'
        );
        helper.command.tagAllComponents('--force');
        mergeCommandScope = helper.scopeHelper.cloneLocalScope();
      });
      describe('using --manual strategy', () => {
        let output;
        let localConsumerFiles;
        before(() => {
          output = helper.command.mergeVersion('0.0.1', 'string/pad-left', '--manual');
          localConsumerFiles = helper.fs.getConsumerFiles();
        });
        it('should leave the file in a conflict state and', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.manual);
        });
        it('tests should failed', () => {
          const tests = helper.general.runWithTryCatch('bit test string/pad-left');
          expect(tests).to.have.string('failed');
        });
        it('bit-merge should update the same files and not create duplications', () => {
          expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/index.js'));
          expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/pad-left.js'));
          expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/pad-left.spec.js'));
          expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left/pad-left.js'));
          expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left/pad-left.spec.js'));
        });
      });
      describe('using --ours strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(mergeCommandScope);
          output = helper.command.mergeVersion('0.0.1', 'string/pad-left', '--ours');
        });
        it('should leave the file intact', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.not.have.string(FileStatusWithoutChalk.manual);
        });
      });
      describe('using --theirs strategy', () => {
        let output;
        let localConsumerFiles;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(mergeCommandScope);
          output = helper.command.mergeVersion('0.0.1', 'string/pad-left', '--theirs');
          localConsumerFiles = helper.fs.getConsumerFiles();
        });
        it('should update the file', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.updated);
        });
        it.skip('tests should pass', () => {
          // @todo: we currently have a bug there, when it load string/pad-left with the version of 0.0.1
          // the dependency-resolver shows an error:
          // the auto-generated file is-string/is-string.js should be connected to 7g7ousor-remote/string/is-string@0.0.1, however, it's not part of the model dependencies of 7g7ousor-remote/string/pad-left@0.0.2
          const tests = helper.general.runWithTryCatch('bit test string/pad-left');
          expect(tests).to.have.string('tests passed');
        });
        it('bit-merge should update the same files and not create duplications', () => {
          expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/index.js'));
          expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/pad-left.js'));
          expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left/pad-left.spec.js'));
          expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left/pad-left.js'));
          expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left/pad-left.spec.js'));
        });
      });
    });
    describe('checkout command inside an inner directory', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.fs.createFile('src/pad-left', 'pad-left.js', 'modified-pad-left-original');
        helper.command.tagAllComponents('--force'); // 0.0.2
        helper.command.checkoutVersion(
          '0.0.1',
          'string/pad-left',
          undefined,
          path.join(helper.scopes.localPath, 'src')
        );
      });
      it('should not change the rootDir in bitMap file', () => {
        const bitMap = helper.bitMap.read();
        const padLeft = bitMap[`${helper.scopes.remote}/string/pad-left@0.0.1`];
        expect(padLeft.rootDir).to.equal('src/pad-left');
      });
    });
    describe('change the dependency version manually from package.json of the dependent', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.importComponent('string/is-string -p src/is-string');
        helper.command.tagAllComponents('-s 0.0.2');
        const padLeftDir = path.join(helper.scopes.localPath, 'src/pad-left');
        const packageJson = helper.packageJson.read(padLeftDir);
        packageJson.dependencies[`@bit/${helper.scopes.remote}.string.is-string`] = '0.0.1';
        helper.packageJson.write(packageJson, padLeftDir);
      });
      it('bit diff should show the dependencies difference', () => {
        const diff = helper.command.diff();
        expect(diff).to.have.string(`- ${helper.scopes.remote}/string/is-string@0.0.2`);
        expect(diff).to.have.string(`+ ${helper.scopes.remote}/string/is-string@0.0.1`);
      });
      it('should be able to tag the component with no error thrown', () => {
        const output = helper.command.tagAllComponents();
        expect(output).to.has.string('1 component(s) tagged');
      });
    });
    describe('manually remove dependencies', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeExport);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        const overrides = {
          '*': {
            dependencies: {
              'file://src/**/*': '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
        helper.command.tagAllComponents();
      });
      it('should save pad-left without is-string dependency', () => {
        const padLeft = helper.command.catComponent('string/pad-left@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(padLeft.dependencies).to.have.lengthOf(0);
      });
      it('should save the overrides data in both components', () => {
        const padLeft = helper.command.catComponent('string/pad-left@latest');
        const isString = helper.command.catComponent('string/is-string@latest');
        const expectedOverrides = { dependencies: { 'file://src/**/*': '-' } };
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(padLeft.overrides).to.deep.equal(expectedOverrides);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(isString.overrides).to.deep.equal(expectedOverrides);
      });
      describe('import in another workspace', () => {
        let authorAfterExport;
        before(() => {
          helper.command.exportAllComponents();
          authorAfterExport = helper.scopeHelper.cloneLocalScope();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteEnvironment();
          helper.scopeHelper.addGlobalRemoteScope();
          helper.command.importComponent('string/pad-left');
        });
        it('should not show the component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        describe('re-import for author after changing the overrides of the imported', () => {
          before(() => {
            const padLeftDir = path.join(helper.scopes.localPath, 'components/string/pad-left');
            const packageJson = helper.packageJson.read(padLeftDir);
            packageJson.bit.overrides.dependencies['@bit/string/*'] = '-';
            helper.packageJson.write(packageJson, padLeftDir);
            helper.command.tagAllComponents('--force'); // must force. the tests fails as the is-string dep is not there
            helper.command.exportAllComponents();
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.getClonedLocalScope(authorAfterExport);
            helper.scopeHelper.addRemoteScope();
            helper.scopeHelper.addRemoteEnvironment();
            helper.scopeHelper.addGlobalRemoteScope();
            helper.command.importComponent('string/pad-left');
          });
          it('should write the updated overrides into consumer bit.json', () => {
            const bitJson = helper.bitJson.read();
            const padLeftComp = `${helper.scopes.remote}/string/pad-left`;
            expect(bitJson.overrides).to.have.property(padLeftComp);
            expect(bitJson.overrides[padLeftComp]).to.have.property('dependencies');
            expect(bitJson.overrides[padLeftComp]).to.have.property('env');
            expect(bitJson.overrides[padLeftComp].env.compiler).to.deep.equal(
              `${helper.scopes.env}/compilers/babel@0.0.1`
            );
          });
          it('should write the compiler and the tester as strings because they dont have special configuration', () => {
            const bitJson = helper.bitJson.read();
            const padLeftComp = `${helper.scopes.remote}/string/pad-left`;
            expect(bitJson.overrides[padLeftComp].env.compiler).to.deep.equal(
              `${helper.scopes.env}/compilers/babel@0.0.1`
            );
            expect(bitJson.overrides[padLeftComp].env.tester).to.deep.equal('global-remote/testers/mocha@0.0.12');
          });
        });
      });
    });
    describe('changing the dist to be outside the components dir after the import', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeImport);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.importComponent('string/pad-left -p src/pad-left');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
      });
      it('should show a descriptive error when tagging the component', () => {
        const error = helper.general.runWithTryCatch('bit tag -a -s 2.0.0');
        expect(error).to.have.string(
          'to rebuild the "dist" directory for all components, please run "bit import --merge"'
        );
      });
      describe('running bit import --merge', () => {
        before(() => {
          helper.command.runCmd('bit import --merge');
        });
        it('should rebuild the dist directory for all components and dependencies', () => {
          const distDir = path.join(helper.scopes.localPath, 'dist');
          expect(distDir).to.be.a.path();
          expect(
            path.join(distDir, 'components/.dependencies/string/is-string', helper.scopes.remote, '0.0.1/is-string.js')
          ).to.be.a.file();
          expect(path.join(distDir, 'pad-left/pad-left/pad-left.js')).to.be.a.file();
        });
        it('should be able to tag the components', () => {
          const tagCmd = () => helper.command.tagScope('2.0.0');
          expect(tagCmd).to.not.throw();
        });
      });
    });
  });
});
