import { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit dependencies command', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('bit deps get', () => {
    describe('running the command on a new component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.populateComponents(1);
      });
      it('should not throw an error saying the id is missing from the graph', () => {
        expect(() => helper.command.dependenciesGet('comp1')).to.not.throw();
      });
    });
  });
  describe('bit deps set', () => {
    describe('adding prod dep', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.fixtures.populateComponents(3);
        helper.command.dependenciesSet('comp1', 'lodash@3.3.1');
      });
      it('bit show should show the newly added dep', () => {
        const show = helper.command.showComponent('comp1');
        expect(show).to.have.string('lodash@3.3.1');
      });
      describe('adding another dep as a devDep', () => {
        let showConfig: Record<string, any>;
        before(() => {
          helper.command.dependenciesSet('comp1', 'some-pkg@1.1.1', '--dev');
          showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        });
        it('should save the dev in the devDependencies', () => {
          const dep = showConfig.data.dependencies.find((d) => d.id === 'some-pkg');
          expect(dep).to.not.be.undefined;
          expect(dep.lifecycle).to.equal('dev');
        });
        it('should not remove the dep that was added before', () => {
          const dep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
          expect(dep).to.not.be.undefined;
        });
      });
    });
  });
});
