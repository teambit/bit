import { expect } from 'chai';
import Helper from '../e2e-helper';
import * as api from '../../src/api';

describe('show api', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('show()', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.tagScope('1.0.0');
      helper.exportAllComponents();
    });
    describe('with no options', () => {
      it('should return an object of the component with the latest version', async () => {
        const result = await api.show(helper.remoteScopePath, `${helper.remoteScope}/bar/foo@0.0.1`);
        expect(result).to.be.an('object');
        expect(result)
          .to.have.property('name')
          .that.equals('bar/foo');
      });
    });
    describe('with versions = true', () => {
      it('should return an array of all versions of the component', async () => {
        const result = await api.show(helper.remoteScopePath, `${helper.remoteScope}/bar/foo@0.0.1`, {
          versions: true
        });
        expect(result)
          .to.be.an('array')
          .with.lengthOf(2);
        expect(result[0])
          .to.have.property('name')
          .that.equals('bar/foo');
        expect(result[0])
          .to.have.property('version')
          .that.equals('0.0.1');
        expect(result[1])
          .to.have.property('name')
          .that.equals('bar/foo');
        expect(result[1])
          .to.have.property('version')
          .that.equals('1.0.0');
      });
    });
  });
});
