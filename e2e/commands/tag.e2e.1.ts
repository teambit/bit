import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { VersionAlreadyExists } from '../../src/scope/exceptions';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit tag command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  before(() => {
    helper.scopeHelper.reInitLocalScopeHarmony();
  });
  describe('tag component with invalid mainFile in bitmap', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      const bitMap = helper.bitMap.read();
      bitMap['bar/foo'].mainFile = '';
      helper.bitMap.write(bitMap);
      try {
        helper.command.tagWithoutBuild('bar/foo');
      } catch (err: any) {
        output = err.toString();
      }
    });
    it('should not tag the component', () => {
      expect(output).to.have.string('error: main file');
      expect(output).to.have.string('was removed');
    });
  });
  describe('semver flags', () => {
    let output;
    describe('tag specific component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fs.createFile('components/patch', 'patch.js');
        helper.fs.createFile('components/minor', 'minor.js');
        helper.fs.createFile('components/major', 'major.js');
        helper.fs.createFile('components/exact', 'exact.js');
        helper.command.addComponent('components/*', { n: 'components' });
        helper.command.tagAllWithoutBuild();
      });
      it('Should not allow invalid semver', () => {
        helper.fs.createFile('components/default', 'default.js');
        helper.command.addComponent('components/default', { i: 'components/default' });
        const version = 'invalidVersion';
        const tag = () => helper.command.tagWithoutMessage('components/default', version);
        expect(tag).to.throw(
          `error: version ${version} is not a valid semantic version. learn more: https://semver.org`
        );
      });
      it('Should increment the patch version when no version type specified', () => {
        output = helper.command.tagWithoutBuild('components/default', '-f');
        expect(output).to.have.string('components/default@0.0.1');
      });
      it('Should increment the patch version when --patch flag specified', () => {
        output = helper.command.tagWithoutBuild('components/patch', '-f --patch');
        expect(output).to.have.string('components/patch@0.0.2');
      });
      it('Should increment the minor version when --minor flag specified', () => {
        output = helper.command.tagWithoutBuild('components/minor', '-f --minor');
        expect(output).to.have.string('components/minor@0.1.0');
      });
      it('Should increment the major version when --major flag specified', () => {
        output = helper.command.tagWithoutBuild('components/major', '-f --major');
        expect(output).to.have.string('components/major@1.0.0');
      });
      it('Should set the exact version when specified on new component', () => {
        helper.fs.createFile('components/exact2', 'exact-new.js');
        helper.command.addComponent('components/exact2', { i: 'components/exact-new' });
        output = helper.command.tagWithoutBuild('components/exact-new@5.12.10', '-f');
        expect(output).to.have.string('components/exact-new@5.12.10');
      });
      it('Should set the exact version when specified on existing component', () => {
        output = helper.command.tagWithoutBuild('components/exact@3.3.3', '-f');
        expect(output).to.have.string('components/exact@3.3.3');
      });
      it('Should increment patch version of dependent when using other flag on tag dependency', () => {
        helper.fs.createFile('components/dependency', 'dependency.js');
        const fixture = "import foo from '../dependency/dependency'";
        helper.fs.createFile('components/dependent', 'dependent.js', fixture);
        helper.command.addComponent('components/dependency components/dependent', { n: 'components' });
        helper.command.linkAndRewire();
        helper.command.tagAllWithoutBuild();
        helper.command.tagWithoutBuild('components/dependency', '-f --major');
        const listOutput = helper.command.listLocalScopeParsed();
        expect(listOutput).to.deep.include({
          id: 'my-scope/components/dependency',
          localVersion: '1.0.0',
          deprecated: false,
          currentVersion: '1.0.0',
          remoteVersion: 'N/A',
        });
        expect(listOutput).to.deep.include({
          id: 'my-scope/components/dependent',
          localVersion: '0.0.2',
          deprecated: false,
          currentVersion: '0.0.2',
          remoteVersion: 'N/A',
        });
      });
      it('Should throw error when the version already exists', () => {
        helper.command.tagWithoutBuild('components/exact --ver 5.5.5', '-f');
        const tagWithExisting = () => helper.command.tagWithoutBuild('components/exact --ver 5.5.5', '-f');
        const error = new VersionAlreadyExists('5.5.5', 'components/exact');
        helper.general.expectToThrow(tagWithExisting, error);
      });
    });
  });
  describe('with removed file/files', () => {
    beforeEach(() => {
      helper.scopeHelper.initNewLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'index.js');
      helper.command.addComponent('bar', { i: 'bar/foo' });
    });
    it('Should not let you tag with a non-existing dependency', () => {
      let errMsg;
      helper.fs.createFile('bar', 'foo.js', '');
      helper.fs.createFile('bar', 'index.js', 'var foo = require("./foo.js")');
      helper.command.addComponent('bar/', { i: 'bar/foo' });
      helper.fs.deletePath('bar/foo.js');
      try {
        helper.command.runCmd('bit tag -a');
      } catch (err: any) {
        errMsg = err.message;
      }
      const output = helper.command.listLocalScope();
      expect(errMsg).to.have.string('error: issues found with the following components');
      expect(output).to.not.have.string('bar/foo');
    });
  });
  describe('with Windows end-of-line characters', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      const impl = 'hello\r\n world\r\n';
      helper.fixtures.createComponentBarFoo(impl);
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
    });
    it('should write the file to the model with Linux EOL characters', () => {
      const barFoo = helper.command.catComponent('bar/foo@latest');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const fileHash = barFoo.files[0].file;
      const fileContent = helper.command.runCmd(`bit cat-object ${fileHash} -s`);
      // notice how the \r is stripped
      expect(fileContent).to.have.string('"hello\\n world\\n"');
    });
  });
  describe('tag a component without its dependencies', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.populateComponents(2);
      output = helper.general.runWithTryCatch('bit tag comp1');
    });
    it('should show a descriptive error message', () => {
      expect(output).to.have.string('this dependency was not included in the tag command');
    });
  });
});
