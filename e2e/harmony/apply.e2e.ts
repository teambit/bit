import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('apply command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('apply with forkFrom prop', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    describe('snapping them all at the same time without dependencies changes', () => {
      let data;
      before(() => {
        data = [
          {
            componentId: `${helper.scopes.remote}/compa`,
            forkFrom: `${helper.scopes.remote}/comp1`,
            message: `msg for first comp`,
          },
          {
            componentId: `${helper.scopes.remote}/compb`,
            forkFrom: `${helper.scopes.remote}/comp2`,
            message: `msg for second comp`,
          },
          {
            componentId: `${helper.scopes.remote}/compc`,
            forkFrom: `${helper.scopes.remote}/comp3`,
            message: `msg for third comp`,
          },
        ];
        // console.log('command', `bit _snap '${JSON.stringify(data)}'`);
        helper.command.apply(data, '--snap');
      });
      it('should save the components and dependencies according to the new ids', () => {
        const comp1Head = helper.command.getHead(`${helper.scopes.remote}/compa`);
        const comp1OnBare = helper.command.catObject(comp1Head, true);
        expect(comp1OnBare.log.message).to.equal('msg for first comp');
        expect(comp1OnBare.dependencies[0].id.name).to.equal('compb');
        expect(comp1OnBare.dependencies[0].packageName).to.equal(`@${helper.scopes.remote}/compb`);
        const flattenedDepNames = comp1OnBare.flattenedDependencies.map((d) => d.name);
        expect(flattenedDepNames).to.include('compb');
        expect(flattenedDepNames).to.include('compc');
        expect(flattenedDepNames).to.not.include('comp2');
        expect(flattenedDepNames).to.not.include('comp3');
      });
    });
  });
});
