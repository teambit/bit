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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
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
        describe('ejecting config and changing a dependency', () => {
          before(() => {
            helper.command.ejectConf('comp1');
            helper.command.dependenciesSet('comp1', 'some-pkg@1.1.2', '--dev');
          });
          it('should not remove the dep that was added before', () => {
            const dep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
            expect(dep).to.not.be.undefined;
          });
        });
      });
    });
    describe('adding multiple deps', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', 'lodash@3.3.1 ramda@0.0.27');
      });
      it('should set them all', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.27');
        const lodashDep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
        expect(lodashDep.version).to.equal('3.3.1');
      });
      describe('removing them with and without version', () => {
        before(() => {
          helper.command.dependenciesRemove('comp1', 'lodash@3.3.1 ramda');
        });
        it('should remove them all', () => {
          const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
          const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
          expect(ramdaDep).to.be.undefined;
          const lodashDep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
          expect(lodashDep).to.be.undefined;
        });
      });
    });
    describe('adding scoped package', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', '@scoped/button@3.3.1');
      });
      it('should set it correctly', () => {
        const show = helper.command.showComponent('comp1');
        expect(show).to.have.string('@scoped/button@3.3.1');
      });
    });
    describe('adding prod dep, tagging then adding devDep', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', 'lodash@3.3.1');
        helper.command.tagAllWithoutBuild();
        helper.command.dependenciesSet('comp1', 'ramda@0.0.20', '--dev');
      });
      it('should not remove the previously added dependencies', () => {
        const show = helper.command.showComponent('comp1');
        expect(show).to.have.string('lodash');
      });
    });
  });
  describe('bit deps remove - removing components', () => {
    describe('removing a component', () => {
      let beforeRemove: string;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateComponents(2);
        beforeRemove = helper.scopeHelper.cloneLocalScope();
      });
      it('should support component-id syntax', () => {
        helper.command.dependenciesRemove('comp1', 'comp2');
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        expect(showConfig.config.policy.dependencies).to.deep.equal({ '@my-scope/comp2': '-' });
      });
      it('should support package-name syntax', () => {
        helper.scopeHelper.getClonedLocalScope(beforeRemove);
        helper.command.dependenciesRemove('comp1', '@my-scope/comp2');
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        expect(showConfig.config.policy.dependencies).to.deep.equal({ '@my-scope/comp2': '-' });
      });
    });
  });
});
