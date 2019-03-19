import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

describe.only('component config', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when importing a component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    describe('importing without --conf flag', () => {
      before(() => {
        helper.importComponent('bar/foo');
      });
      it('should write the configuration data into the component package.json file', () => {});
      describe('adding override to the package.json of the component', () => {});
    });
    describe('importing with --conf flag', () => {
      before(() => {
        helper.importComponent('bar/foo --conf');
      });
      it('should write the configuration data also to bit.json file', () => {});
      it('bit.json should not include the "dependencies" property anymore', () => {
        const bitJson = helper.readBitJson('components/bar/foo');
        expect(bitJson).to.not.have.property('dependencies');
        expect(bitJson).to.not.have.property('packageDependencies');
      });
    });
  });
});
