import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import BitsrcTester, { username } from '../bitsrc-tester';

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
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const sourceDir = path.join(helper.getFixturesDir(), 'components');
      const destination = path.join(helper.localScopePath, 'src');
      fs.copySync(path.join(sourceDir, 'is-string'), path.join(destination, 'is-string'));
      fs.copySync(path.join(sourceDir, 'pad-left'), path.join(destination, 'pad-left'));

      helper.addComponent('src/is-string -t src/is-string/is-string.spec.js -i string/is-string');
      helper.addComponent('src/pad-left -t src/pad-left/pad-left.spec.js -i string/pad-left');

      helper.importCompiler('bit.envs/compilers/flow@0.0.6');
      helper.importTester('bit.envs/testers/mocha@0.0.4');
      helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
      helper.runCmd('npm init -y');
      helper.runCmd('npm install chai -D');
      helper.tagAllWithoutMessage();
      scopeBeforeExport = helper.cloneLocalScope();
      helper.exportAllComponents();

      originalScope = helper.cloneLocalScope();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
      helper.importComponent('string/pad-left -p src/pad-left');
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
      describe.only('exporting with --eject option', () => {
        let scopeName;
        let exportOutput;
        before(() => {
          helper.getClonedLocalScope(scopeBeforeExport);
          return bitsrcTester
            .loginToBitSrc()
            .then(() => bitsrcTester.createScope())
            .then((scope) => {
              scopeName = scope;
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
      });
    });
  });
});
