import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

describe('bit untag command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    // helper.destroyEnv();
  });
  describe.only('local single component', () => {
    let localScope;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      localScope = helper.cloneLocalScope();
      const output = helper.listLocalScope();
      expect(output).to.have.string('found 1 components');
    });
    describe('with one version', () => {
      before(() => {
        helper.runCmd('bit untag bar/foo 0.0.1');
      });
      it('should delete the entire component from the model', () => {
        const output = helper.listLocalScope();
        expect(output).to.have.string('found 0 components');
      });
    });
    describe('with multiple versions', () => {
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.commitComponent('bar/foo', undefined, '-f');
        const catComponent = helper.catComponent('bar/foo');
        expect(catComponent.versions).to.have.property('0.0.2');

        helper.runCmd('bit untag bar/foo 0.0.2');
      });
      it('should delete only the specified tag', () => {
        const catComponent = helper.catComponent('bar/foo');
        expect(catComponent.versions).to.not.have.property('0.0.2');
      });
      it('bit show should work', () => {
        const showOutput = helper.showComponentParsed('bar/foo');
        expect(showOutput.name).to.equal('foo');
      });
      it('bit status should show the component as staged', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.have.a.string('no new components');
        expect(output).to.have.a.string('no modified components');
        expect(output).to.not.have.a.string('no staged components');
        expect(output).to.have.a.string('staged components');
      });
    });
  });
});
