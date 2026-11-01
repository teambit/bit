import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Extensions } from '@teambit/legacy.constants';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
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

/**
 * the core empty-env provides nothing: no compiler, tester, linter or preview. an env written in plain
 * JS can use it as its own env (env-of-env) - its source is its package, so nothing needs compiling -
 * and components using that env should work end to end, including for consumers.
 */
(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'a JS env whose env is the core empty-env, used by JS components, end to end',
  function () {
    this.timeout(0);
    const EMPTY_ENV = 'teambit.harmony/empty-env';
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    let appOutput: string;
    let envId: string;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      // the env contributes a package.json prop, which proves it was loaded and applied
      helper.fs.outputFile(
        'my-env/my-env.bit-env.js',
        `class MyEnv {
  constructor() {
    this.name = 'my-env';
  }
  package() {
    return () => ({ packageJsonProps: { main: '{main}.js', myEnvMarker: 'set-by-my-env' }, npmIgnore: [] });
  }
}
module.exports.default = new MyEnv();
`
      );
      helper.fs.outputFile('my-env/index.js', `module.exports = require('./my-env.bit-env');`);
      helper.command.addComponent('my-env');
      helper.command.setEnv('my-env', EMPTY_ENV);
      envId = `${helper.scopes.remote}/my-env`;
      // comp1 requires comp2 by its package name. nothing gets compiled.
      appOutput = helper.fixtures.populateComponents(2, true, '', false);
      helper.command.setEnv('comp1', envId);
      helper.command.setEnv('comp2', envId);
      helper.command.install();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('the env should use the empty-env and the components should use the env', () => {
      expect(helper.env.getComponentEnv('my-env')).to.equal(EMPTY_ENV);
      expect(helper.env.getComponentEnv('comp1')).to.equal(envId);
    });
    it('should apply the env to the components in the workspace', () => {
      const pkgName = helper.general.getPackageNameByCompName('comp1');
      const packageJson = helper.fs.readJsonFile(`node_modules/${pkgName}/package.json`);
      expect(packageJson.myEnvMarker).to.equal('set-by-my-env');
    });
    it('should run in the workspace without compilation', () => {
      expect(helper.command.runCmd('node app.js')).to.have.string(appOutput);
    });
    it('should have no component issues', () => {
      helper.command.expectStatusToNotHaveIssues();
    });
    describe('tag, publish and export', () => {
      before(() => {
        helper.command.tagAllComponents();
        helper.command.export();
      });
      it('should generate a package.json with the env props, main pointing to the source and the component deps', () => {
        const capsule = helper.command.getCapsuleOfComponent('comp1@0.0.1');
        const packageJson = fs.readJsonSync(path.join(capsule, 'package.json'));
        expect(packageJson.main).to.equal('index.js');
        expect(packageJson.myEnvMarker).to.equal('set-by-my-env');
        expect(packageJson.dependencies).to.have.property(helper.general.getPackageNameByCompName('comp2'));
      });
      it('should work when installed as a package in a new workspace', () => {
        helper.scopeHelper.reInitWorkspace();
        const pkgName = helper.general.getPackageNameByCompName('comp1');
        helper.command.install(pkgName);
        const output = helper.command.runCmd(`node -e "console.log(require('${pkgName}')())"`);
        expect(output).to.have.string(appOutput);
      });
      describe('importing the component into a new workspace', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteScope();
          npmCiRegistry.setResolver();
          helper.command.importComponent('comp1');
        });
        it('should load the env from its package, with no issues', () => {
          expect(helper.env.getComponentEnv('comp1')).to.equal(`${envId}@0.0.1`);
          helper.command.expectStatusToNotHaveIssues();
        });
        it('should run the imported component', () => {
          const pkgName = helper.general.getPackageNameByCompName('comp1');
          const output = helper.command.runCmd(`node -e "console.log(require('${pkgName}')())"`);
          expect(output).to.have.string(appOutput);
        });
        describe('when the workspace loads its envs from the scope', () => {
          // a workspace whose envs are not installed - e.g. one whose packages are installed by another
          // package manager - loads them from the scope, isolated in capsules. the env's capsule has no dist
          // and the empty-env no compiler to create one, so the source is what runs, as from node_modules.
          before(() => {
            helper.fs.deletePath(`node_modules/${helper.general.getPackageNameByCompName('my-env')}`);
            helper.workspaceJsonc.addKeyValToWorkspace('resolveAspectsFromNodeModules', false);
          });
          it('should load the env, with no issues', () => {
            expect(helper.env.getComponentEnv('comp1')).to.equal(`${envId}@0.0.1`);
            helper.command.expectStatusToNotHaveIssues();
          });
          it('should apply the env when tagging the imported component', () => {
            helper.command.tagAllComponents('--unmodified');
            const capsule = helper.command.getCapsuleOfComponent('comp1@0.0.2');
            const packageJson = fs.readJsonSync(path.join(capsule, 'package.json'));
            expect(packageJson.myEnvMarker).to.equal('set-by-my-env');
          });
        });
      });
    });
  }
);
