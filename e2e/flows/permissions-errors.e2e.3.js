import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('permissions', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('adding a component with sudo', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      const output = helper.runCmd('sudo bit add bar/foo.js');
      expect(output).to.have.string('Warning');
      expect(output).to.have.string('root');
    });
    describe('tagging the same component without sudo', () => {
      it('should show a descriptive error', () => {
        const output = helper.runWithTryCatch('bit tag -a');
        expect(output).to.have.string('error: you do not have permissions to access');
        expect(output).to.have.string('were you running bit, npm or git as root');
      });
    });
  });
});
