import chai, { expect } from 'chai';
import { Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { IssuesClasses } from '@teambit/component-issues';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
chai.use(chaiFs);
chai.use(chaiString);

/** create an env defined solely by a *.bit-env.* plugin file (no env-of-env configured) */
function createBitEnvPluginEnv(helper: Helper) {
  helper.fs.outputFile(
    'my-env/my-env.bit-env.ts',
    `export class MyEnv {
  name = 'my-env';
}
export default new MyEnv();
`
  );
  helper.fs.outputFile('my-env/index.ts', `export { MyEnv } from './my-env.bit-env';`);
  helper.command.addComponent('my-env');
  helper.command.compile();
}

describe('env command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('bit env set', () => {
    describe('run bit env set and then tag when the variants points to another env', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.extensions.addExtensionToVariant('*', 'teambit.react/react', undefined, true);
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', 'teambit.harmony/aspect');
        helper.command.tagAllWithoutBuild();
      });
      it('should not be modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(0);
      });
      it('should not change the env to the variants one', () => {
        const env = helper.env.getComponentEnv('comp1');
        expect(env).to.equal('teambit.harmony/aspect');
      });
      it('ejecting the conf to component.json should not write internal fields', () => {
        helper.command.ejectConf('comp1');
        const compJson = helper.componentJson.read('comp1');
        expect(compJson.extensions[Extensions.envs]).to.not.have.property('__specific');
      });
    });
    describe('run bit env set X and then bit env set Y', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', 'teambit.harmony/aspect');
        helper.command.setEnv('comp1', 'teambit.react/react');
      });
      it('should replace the env with the last one and remove the first one', () => {
        const show = helper.command.showComponent('comp1');
        expect(show).to.not.have.string('teambit.harmony/aspect');
      });
    });
    describe('run bit env set when there is a component.json', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.ejectConf('comp1');
        helper.command.setEnv('comp1', 'teambit.harmony/aspect');
      });
      it('should write the env into the component.json file', () => {
        const compJson = helper.componentJson.read('comp1');
        expect(compJson.extensions).to.have.property(Extensions.envs);
      });
      it('should not add "config" to the .bitmap file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1).to.not.have.property('config');
      });
      it('should set the new env correctly', () => {
        const env = helper.env.getComponentEnv('comp1');
        expect(env).to.equal('teambit.harmony/aspect');
      });
      describe('run bit env unset', () => {
        before(() => {
          helper.command.unsetEnv('comp1');
        });
        it('should unset the env correctly', () => {
          const env = helper.env.getComponentEnv('comp1');
          expect(env).to.not.equal('teambit.harmony/aspect');
        });
        it('should remove the env from the component.json file', () => {
          const compJson = helper.componentJson.read('comp1');
          expect(compJson.extensions).to.not.have.property(Extensions.envs);
        });
      });
    });
    describe('run bit env unset on component without env config in .bitmap', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', 'teambit.harmony/aspect');
        helper.command.tagAllWithoutBuild();
      });
      it('should indicate that there was no env config in .bitmap to remove', () => {
        const output = helper.command.unsetEnv('comp1');
        expect(output).to.have.string(
          'unable to find components matching the pattern with env configured in the .bitmap file'
        );
      });
      it('should not change the bitmap file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1).to.not.have.property('config');
      });
    });
  });
  describe('env defined only by a .bit-env plugin file, before it was ever loaded', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      createBitEnvPluginEnv(helper);
    });
    // previously, a component was recognized as an env only after it was loaded as an aspect,
    // which happened only once its own env (env-of-env, e.g. teambit.envs/env or
    // bitdev.general/envs/bit-env) was configured and loadable. a just-created env with no
    // env-of-env failed "bit env set" with "the component <id> is not an env", although the
    // *.bit-env.* plugin file is what defines the env instance and identifies it as an env.
    it('bit env set should recognize it as an env', () => {
      expect(() => helper.command.setEnv('comp1', 'my-env')).to.not.throw();
    });
    it('the env should be loaded as an aspect and set as the component env', () => {
      expect(helper.env.getComponentEnv('comp1')).to.have.string('my-env');
    });
    it('bit snap should work', () => {
      expect(() => helper.command.snapAllComponentsWithoutBuild()).to.not.throw();
    });
  });
  describe('component using a .bit-env plugin-file env should have a clean status', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      createBitEnvPluginEnv(helper);
      helper.command.setEnv('comp1', 'my-env');
      helper.command.install();
      helper.command.tagAllWithoutBuild();
    });
    // the plugin file identifies the component as an env - it must not be reported as
    // misconfigured just because its own env is not an env-env (teambit.envs/env or
    // bitdev.general/envs/bit-env)
    it('should not warn that the env is not of type env', () => {
      const output = helper.command.status();
      expect(output).to.not.have.string('is not of type env');
    });
    // this covers MissingDists as well: my-env provides no compiler, so comp1 is consumed
    // as-source - there are no dists to miss, and "bit compile" would not produce any
    it('should have no component issues at all', () => {
      helper.command.expectStatusToNotHaveIssues();
    });
  });
  describe('bit env replace', () => {
    describe('replacing a failed-loaded env', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.env.setEmptyEnv();

        helper.fixtures.populateComponents(1, false);
        helper.command.setEnv('comp1', 'empty-env');
        helper.fs.outputFile('empty-env/empty-env.bit-env.ts', 'throw new Error("my-error");');
        helper.command.compile();
        helper.command.expectStatusToHaveIssue(IssuesClasses.NonLoadedEnv.name);
      });
      it('should be able to replace with no errors', () => {
        const output = helper.command.replaceEnv(`${helper.scopes.remote}/empty-env`, 'teambit.react/react');
        expect(output).to.have.string('added teambit.react/react env to the following component(s):');
      });
    });
  });
});
