import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('custom aspects', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('create custom aspect', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();

      // Create first aspect that will be used as a dependency
      helper.command.create('aspect', 'dep');

      // Create second env aspect that will depend upon "aspect-dep"
      helper.command.create('aspect', 'env');
      helper.extensions.addExtensionToWorkspace('my-scope/env', {
        'teambit.dependencies/dependency-resolver': {
          policy: {
            dependencies: {
              dep: '^0.0.0',
            },
          },
        },
      });
      helper.fs.outputFile('my-scope/env/env.main.runtime.ts', getEnvRuntime());

      // Set all scope aspects as aspects
      helper.extensions.addExtensionToVariant('my-scope/env', 'teambit.harmony/aspect');
      helper.extensions.addExtensionToVariant('my-scope/dep', 'teambit.harmony/aspect');

      // Create test component using the env
      helper.fixtures.populateComponents(1);
      helper.extensions.addExtensionToVariant('comp1', 'my-scope/env');

      // helper.command.tagAllWithoutBuild();
      // helper.command.export();
    });

    it.only('should compile without error', async () => {
      expect(() => {
        helper.command.link();
        helper.command.compile();
        helper.command.install();
      }).to.not.throw();

      helper.command.list();

      const comp1 = helper.command.catComponent('comp1');
      const compEnv = getEnvIdFromModel(comp1);
      console.log(compEnv);
      // const builder = harmony.get<BuilderMain>(BuilderAspect.id);
      // const tasks = builder.listTasks(component);
      // expect(tasks.snapTasks).to.include('teambit.pkg/pkg:PublishComponents');
    });
  });
});

function getEnvRuntime() {
  return `import { MainRuntime } from '@teambit/cli';
import { EnvAspect } from './env.aspect';
import { DepAspect, DepMain } from '@my-scope/dep';

export class EnvMain {
  static slots = [];
  static dependencies = [
    DepAspect
  ];
  static runtime = MainRuntime;
  static async provider([dep]: [DepMain]) {
    if(!dep) {
      throw new Error('Dep dependency is missing');
    }
    return new EnvMain();
  }
}

EnvAspect.addRuntime(EnvMain);`;
}

function getEnvIdFromModel(compModel: any): string {
  const envEntry = compModel.extensions.find((ext) => ext.name === 'teambit.envs/envs');
  const envId = envEntry.data.id;
  return envId;
}
