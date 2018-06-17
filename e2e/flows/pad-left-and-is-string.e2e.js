import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import BitsrcTester, { username } from '../bitsrc-tester';
import { FileStatusWithoutChalk } from '../commands/merge.e2e';

chai.use(require('chai-fs'));

describe('a flow with two components: is-string and pad-left, where is-string is a dependency of pad-left', function () {
  this.timeout(0);
  const helper = new Helper();
  const bitsrcTester = new BitsrcTester();
  after(() => {
    helper.destroyEnv();
  });
  describe('when originallySharedDir is the same as dist.entry (src)', () => {
    let originalScope;
    let scopeBeforeExport;
    let scopeAfterImport;
    let remoteScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const sourceDir = path.join(helper.getFixturesDir(), 'components');
      const destination = path.join(helper.localScopePath, 'src');
      fs.copySync(path.join(sourceDir, 'is-string'), path.join(destination, 'is-string'));
      fs.copySync(path.join(sourceDir, 'pad-left'), path.join(destination, 'pad-left'));

      helper.addComponent('src/is-string -t src/is-string/is-string.spec.js -i string/is-string');
      helper.addComponent('src/pad-left -t src/pad-left/pad-left.spec.js -i string/pad-left');

      helper.importCompiler('bit.envs/compilers/flow@0.0.6');
      helper.importTester('bit.envs/testers/mocha@0.0.12');
      helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
      helper.runCmd('npm init -y');
      helper.runCmd('npm install chai -D');
      helper.tagAllWithoutMessage();
      scopeBeforeExport = helper.cloneLocalScope();
      helper.exportAllComponents();

      originalScope = helper.cloneLocalScope();
      remoteScope = helper.cloneRemoteScope();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
      helper.importComponent('string/pad-left -p src/pad-left');
      scopeAfterImport = helper.cloneLocalScope();
    });
    it('should be able to run the tests', () => {
      const output = helper.testComponent('string/pad-left');
      expect(output).to.have.string('tests passed');
    });
    it('should save the paths in the model as Linux format', () => {
      const isString = helper.catComponent(`${helper.remoteScope}/string/is-string@latest`);
      expect(isString.docs[0].filePath).to.equal('src/is-string/is-string.js');
      expect(isString.specsResults[0].specFile).to.equal('is-string/is-string.spec.js');
      isString.dists.forEach(dist => expect(dist.relativePath.startsWith('src/is-string')).to.be.true);
      isString.files.forEach(file => expect(file.relativePath.startsWith('src/is-string')).to.be.true);
    });
    describe('changing to absolute syntax and tagging', () => {
      before(() => {
        const padLeftFile = path.join(helper.localScopePath, 'src', 'pad-left', 'pad-left', 'pad-left.js');
        const padLeftContent = fs.readFileSync(padLeftFile).toString();
        const relativeSyntax = '../is-string/is-string';
        const absoluteSyntax = helper.getRequireBitPath('string', 'is-string');
        fs.outputFileSync(padLeftFile, padLeftContent.replace(relativeSyntax, absoluteSyntax));

        // an intermediate step, make sure, bit-diff is not throwing an error
        const diffOutput = helper.diff();
        expect(diffOutput).to.have.string("-import isString from '../is-string/is-string';");

        helper.tagAllWithoutMessage();
        helper.exportAllComponents();
      });
      it('should not add both originallySharedDir and dist.entry because they are the same', () => {
        const padLeftModel = helper.catComponent(`${helper.remoteScope}/string/pad-left@latest`);
        padLeftModel.dists.forEach(dist => expect(dist.relativePath.startsWith('src/pad-left')).to.be.true);
      });
      it('should not add the dist.entry if it was not removed before', () => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'any' });
        helper.importComponent('string/pad-left -p src/pad-left');
        helper.commitComponent('string/pad-left', 'msg', '-f');
        const padLeftModel = helper.catComponent(`${helper.remoteScope}/string/pad-left@latest`);
        padLeftModel.dists.forEach(dist => expect(dist.relativePath.startsWith('src/pad-left')).to.be.true);
      });
      describe('importing back to the original repo', () => {
        before(() => {
          helper.getClonedLocalScope(originalScope);
          helper.importComponent('string/pad-left');
        });
        it('should be able to pass the tests', () => {
          const output = helper.testComponent('string/pad-left');
          expect(output).to.have.string('tests passed');
        });
      });
      describe('exporting with --eject option', () => {
        let scopeName;
        let exportOutput;
        let isStringId;
        let padLeftId;
        before(() => {
          helper.getClonedLocalScope(scopeBeforeExport);
          return bitsrcTester
            .loginToBitSrc()
            .then(() => bitsrcTester.createScope())
            .then((scope) => {
              scopeName = scope;
              isStringId = `${username}.${scopeName}.string.is-string`;
              padLeftId = `${username}.${scopeName}.string.pad-left`;
              helper.exportAllComponents(`${username}.${scopeName}`);
              helper.reInitLocalScope();
              helper.runCmd(`bit import ${username}.${scopeName}/string/is-string`);
              helper.runCmd(`bit import ${username}.${scopeName}/string/pad-left`);
              helper.runCmd('bit tag -a -s 2.0.0');
              exportOutput = helper.exportAllComponents(`${username}.${scopeName} --eject`);
            });
        });
        after(() => {
          return bitsrcTester.deleteScope(scopeName);
        });
        it('should export them successfully', () => {
          expect(exportOutput).to.have.a.string('exported 2 components to scope');
        });
        it('should delete the original component files from the file-system', () => {
          expect(path.join(helper.localScopePath, 'components/string/is-string')).not.to.be.a.path();
          expect(path.join(helper.localScopePath, 'components/string/pad-left')).not.to.be.a.path();
        });
        it('should update the package.json with the components as packages', () => {
          const packageJson = helper.readPackageJson();
          expect(packageJson.dependencies[`@bit/${isStringId}`]).to.equal('2.0.0');
          expect(packageJson.dependencies[`@bit/${padLeftId}`]).to.equal('2.0.0');
        });
        it('should have the component files as a package (in node_modules)', () => {
          const nodeModulesDir = path.join(helper.localScopePath, 'node_modules', '@bit');
          expect(path.join(nodeModulesDir, isStringId)).to.be.a.path();
          expect(path.join(nodeModulesDir, padLeftId)).to.be.a.path();
        });
        it('should delete the component from bit.map', () => {
          const bitMap = helper.readBitMap();
          Object.keys(bitMap).forEach((id) => {
            expect(id).not.to.have.string('pad-left');
            expect(id).not.to.have.string('is-string');
          });
        });
      });
    });
    describe('changing to custom module resolutions', () => {
      let originalScopeWithCustomResolve;
      let originalScopeWithCustomResolveBeforeExport;
      before(() => {
        helper.getClonedLocalScope(scopeBeforeExport);
        helper.reInitRemoteScope();
        const padLeftFile = path.join(helper.localScopePath, 'src', 'pad-left', 'pad-left.js');
        const padLeftContent = fs.readFileSync(padLeftFile).toString();
        const relativeSyntax = '../is-string/is-string';
        const customSyntax = 'is-string';
        fs.outputFileSync(padLeftFile, padLeftContent.replace(relativeSyntax, customSyntax));
        const bitJson = helper.readBitJson();
        bitJson.resolveModules = { modulesDirectories: ['src'] };
        helper.writeBitJson(bitJson);

        // an intermediate step, make sure, bit-diff is not throwing an error
        const diffOutput = helper.diff();
        expect(diffOutput).to.have.string("-import isString from '../is-string/is-string';");

        helper.tagAllWithoutMessage();
        originalScopeWithCustomResolveBeforeExport = helper.cloneLocalScope();
        helper.exportAllComponents();
        originalScopeWithCustomResolve = helper.cloneLocalScope();
      });
      it('should not add both originallySharedDir and dist.entry because they are the same', () => {
        const padLeftModel = helper.catComponent(`${helper.remoteScope}/string/pad-left@latest`);
        padLeftModel.dists.forEach(dist => expect(dist.relativePath.startsWith('src/pad-left')).to.be.true);
      });
      it('should indicate that the dependency used custom-module-resolution', () => {
        const padLeftModel = helper.catComponent(`${helper.remoteScope}/string/pad-left@latest`);
        const relativePath = padLeftModel.dependencies[0].relativePaths[0];
        expect(relativePath).to.have.property('isCustomResolveUsed');
        expect(relativePath).to.have.property('importSource');
        expect(relativePath.importSource).to.equal('is-string');
      });
      describe('importing the component to another repo', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
          helper.importComponent('string/pad-left -p src/pad-left');
        });
        it('should not show the component as modified when imported', () => {
          const status = helper.runCmd('bit status');
          expect(status).to.not.have.string('modified');
        });
        describe('changing the component', () => {
          before(() => {
            const padLeftFile = path.join(helper.localScopePath, 'src', 'pad-left', 'pad-left.js');
            const padLeftContent = fs.readFileSync(padLeftFile).toString();
            fs.outputFileSync(padLeftFile, `${padLeftContent}\n`);

            // intermediate step, make sure the component is modified
            const status = helper.runCmd('bit status');
            expect(status).to.have.string('modified');
          });
          it('should be able to pass the tests', () => {
            const output = helper.testComponent('string/pad-left');
            expect(output).to.have.string('tests passed');
          });
          describe('tag and export, then import back to the original repo', () => {
            before(() => {
              helper.tagAllWithoutMessage();
              helper.exportAllComponents();
              helper.getClonedLocalScope(originalScopeWithCustomResolve);
              helper.importComponent('string/pad-left');
            });
            it('should not show the component as modified when imported', () => {
              const status = helper.runCmd('bit status');
              expect(status).to.not.have.string('modified');
            });
            it('should be able to pass the tests', () => {
              // we must add NODE_PATH=dist for the author to workaround its environment as if it
              // has custom-module-resolution set. In the real world, the author has babel or
              // webpack configured to have "src" as the module resolved directory
              const output = helper.runCmd('NODE_PATH=dist bit test string/pad-left');
              expect(output).to.have.string('tests passed');
            });
          });
        });
      });
      // @todo, this is an important test. however, for some reason, when it runs 'npm install' on
      // the component, it shows an error about missing package.json. it might be related to the
      // fact that the generated scope on bitsrc is private.
      // in any case, when running this test locally, and manually exporting to bitsrc and
      // then running npm install, it does work.
      describe.skip('exporting to bitsrc', () => {
        let scopeName;
        let isStringId;
        let padLeftId;
        let npmOutput;
        before(() => {
          helper.getClonedLocalScope(originalScopeWithCustomResolveBeforeExport);
          return bitsrcTester
            .loginToBitSrc()
            .then(() => bitsrcTester.createScope())
            .then((scope) => {
              scopeName = scope;
              isStringId = `${username}.${scopeName}.string.is-string`;
              padLeftId = `${username}.${scopeName}.string.pad-left`;
              helper.exportAllComponents(`${username}.${scopeName}`);
              helper.reInitLocalScope();
              helper.initNpm();
              helper.runCmd(`npm i @bit/${username}.${scopeName}/string/pad-left`);
            });
        });
        after(() => {
          return bitsrcTester.deleteScope(scopeName);
        });
        it('should have the component files as a package (in node_modules)', () => {
          const nodeModulesDir = path.join(helper.localScopePath, 'node_modules', '@bit');
          expect(path.join(nodeModulesDir, isStringId)).to.be.a.path();
          expect(path.join(nodeModulesDir, padLeftId)).to.be.a.path();
        });
        it('should indicate that postinstall script was installed', () => {
          expect(npmOutput).to.have.string('node .bit.postinstall.js');
        });
        it('should generate .bit.postinstall.js file', () => {
          const nodeModulesDir = path.join(helper.localScopePath, 'node_modules', '@bit');
          expect(path.join(nodeModulesDir, padLeftId, '.bit.postinstall.js')).to.be.a.file();
        });
      });
    });
    describe('merge conflict scenario', () => {
      let output;
      let localConsumerFiles;
      before(() => {
        helper.getClonedLocalScope(originalScope);
        helper.getClonedRemoteScope(remoteScope);
        helper.createFile('src/pad-left', 'pad-left.js', 'modified-pad-left-original');
        helper.tagAllWithoutMessage('--force'); // 0.0.2
        helper.exportAllComponents();

        helper.getClonedLocalScope(scopeAfterImport);
        helper.createFile('src/pad-left/pad-left', 'pad-left.js', 'modified-pad-left-imported');
        helper.tagAllWithoutMessage('--force');
        try {
          helper.exportAllComponents();
        } catch (err) {
          expect(err.toString()).to.have.string('conflict');
        }

        helper.runCmd('bit untag string/pad-left 0.0.2'); // current state: 0.0.1 + modification
        helper.importComponent('string/pad-left --objects');
        output = helper.checkoutVersion('0.0.2', 'string/pad-left', '--manual');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('bit-use should not add any file', () => {
        expect(output).to.not.have.string(FileStatusWithoutChalk.added);
      });
      it('bit-use should update the same files and not create duplications', () => {
        expect(localConsumerFiles).to.include(path.normalize('src/pad-left/index.js'));
        expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left.js'));
        expect(localConsumerFiles).to.include(path.normalize('src/pad-left/pad-left.spec.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/index.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left.js'));
        expect(localConsumerFiles).to.not.include(path.normalize('src/pad-left.spec.js'));
      });
    });
    describe('merge command', () => {
      let mergeCommandScope;
      before(() => {
        helper.getClonedLocalScope(scopeAfterImport);
        helper.getClonedRemoteScope(remoteScope);
        helper.testComponent('string/pad-left');
        helper.createFile('src/pad-left/pad-left', 'pad-left.js', 'modified-pad-left-imported');
        helper.tagAllWithoutMessage('--force');
        mergeCommandScope = helper.cloneLocalScope();
      });
      describe('using --manual strategy', () => {
        let output;
        let localConsumerFiles;
        before(() => {
          output = helper.mergeVersion('0.0.1', 'string/pad-left', '--manual');
          localConsumerFiles = helper.getConsumerFiles();
        });
        it('should leave the file in a conflict state and', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.manual);
        });
        it('tests should failed', () => {
          const tests = helper.runWithTryCatch('bit test string/pad-left');
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
          helper.getClonedLocalScope(mergeCommandScope);
          output = helper.mergeVersion('0.0.1', 'string/pad-left', '--ours');
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
          helper.getClonedLocalScope(mergeCommandScope);
          output = helper.mergeVersion('0.0.1', 'string/pad-left', '--theirs');
          localConsumerFiles = helper.getConsumerFiles();
        });
        it('should update the file', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.updated);
        });
        it.skip('tests should pass', () => {
          // @todo: we currently have a bug there, when it load string/pad-left with the version of 0.0.1
          // the dependency-resolver shows an error:
          // the auto-generated file is-string/is-string.js should be connected to 7g7ousor-remote/string/is-string@0.0.1, however, it's not part of the model dependencies of 7g7ousor-remote/string/pad-left@0.0.2
          const tests = helper.runWithTryCatch('bit test string/pad-left');
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
        helper.getClonedLocalScope(scopeAfterImport);
        helper.getClonedRemoteScope(remoteScope);
        helper.createFile('src/pad-left', 'pad-left.js', 'modified-pad-left-original');
        helper.tagAllWithoutMessage('--force'); // 0.0.2
        helper.checkoutVersion('0.0.1', 'string/pad-left', undefined, path.join(helper.localScopePath, 'src'));
      });
      it('should not change the rootDir in bitMap file', () => {
        const bitMap = helper.readBitMap();
        const padLeft = bitMap[`${helper.remoteScope}/string/pad-left@0.0.1`];
        expect(padLeft.rootDir).to.equal('src/pad-left');
      });
    });
  });
});
