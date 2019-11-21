import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('bit lane command', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('creating a new lane without any component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.createLane();
      output = helper.command.showLanes();
    });
    it('bit lane should show the active lane', () => {
      expect(output).to.have.string('* dev');
    });
  });
  describe('create a snap on master then on a new lane', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponents();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponents();
    });
    it('bit status should show the component only once as staged', () => {
      const status = helper.command.statusJson();
    });
    describe('bit lane with --components flag', () => {
      let output: string;
      before(() => {
        output = helper.command.showLanes('--components');
      });
      it('should show all lanes and mark the current one', () => {
        expect(output).to.have.string('master');
        expect(output).to.have.string('* dev');
      });
    });
  });
});
