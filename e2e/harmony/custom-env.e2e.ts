import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('custom env', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('custom env with 3 components', () => {
    let wsAllNew;
    let envId;
    let envName;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', envId);
      helper.command.compile();
      wsAllNew = helper.scopeHelper.cloneLocalScope(IS_WINDOWS);
    });
    describe('tag', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      it('should have the correct env in the envs aspect data', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const envIdFromModel = getEnvIdFromModel(comp1);
        expect(envIdFromModel).to.equal(envId);
      });
      describe('tag again', () => {
        before(() => {
          // helper.command.tagWithoutBuild(envName, '-f');
          helper.command.tagComponent(envName, 'message', '-f');
        });
        it('should have the correct env in the envs aspect data after additional tag', () => {
          const comp1 = helper.command.catComponent('comp1@latest');
          const envIdFromModel = getEnvIdFromModel(comp1);
          expect(envIdFromModel).to.equal(`${envId}@0.0.2`);
        });
      });
    });
    describe('untag', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(wsAllNew);
        helper.command.tagAllWithoutBuild();
      });
      // previously it used to throw "error: component "node-env@0.0.1" was not found."
      it('should untag successfully', () => {
        expect(() => helper.command.untag('--all')).to.not.throw();
      });
    });
  });
});

function getEnvIdFromModel(compModel: any): string {
  const envEntry = compModel.extensions.find((ext) => ext.name === 'teambit.envs/envs');
  const envId = envEntry.data.id;
  return envId;
}
