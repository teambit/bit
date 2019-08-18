import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

describe('component config', function () {
  this.timeout(0);
  const helper = new Helper();
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
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
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
            compiler: 'my-scope/compiler/my-compiler'
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
    });
    describe('importing with --conf flag', () => {
      before(() => {
        helper.command.importComponent('bar/foo --conf -O');
      });
      it('should write the configuration data also to bit.json file', () => {
        expect(path.join(helper.scopes.localPath, 'components/bar/foo/bit.json')).to.be.a.file();
      });
      it('bit.json should not include the "dependencies" property anymore', () => {
        const bitJson = helper.bitJson.read('components/bar/foo');
        expect(bitJson).to.not.have.property('dependencies');
        expect(bitJson).to.not.have.property('packageDependencies');
      });
    });
  });
});
