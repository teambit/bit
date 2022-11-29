import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../../../src/e2e-helper/e2e-helper';

const ENV_POLICY = {
  peers: [
    {
      name: "react",
      version: "^18.0.0",
      supportedRange: "^17.0.0 || ^18.0.0"
    },
    {
      name: "react-dom",
      version: "^18.0.0",
      supportedRange: "^17.0.0 || ^18.0.0"
    },
    {
      name: "graphql",
      version: "14.7.0",
      supportedRange: "^14.7.0"
    }
  ],
  dev: {
    '@types/react': "18.0.25",
    '@types/react-dom': "^18.0.0",
    '@types/jest': "^29.2.2"
  }
}

const COMPONENTS_POLICY = {
  dependencies: {
    'is-positive': '2.0.0',
    'is-string': '1.0.7',
  }
}

describe('env-jsonc-policies', function () {
  this.timeout(0);
  let helper: Helper;
  let componentShowParsed;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.command.create('react-env', 'custom-react/env1', '-p custom-react/env1');
    helper.command.create('react', 'button', '-p button');
    helper.fs.prependFile('button/button.tsx', 'import isPositive from "is-positive";\n');
    // TODO: change to use new format of envs once everything is merged and exported
    helper.fixtures.populateEnvMainRuntime(`custom-react/env1/env1.main.runtime.ts`, {
      envName: 'env1',
      dependencies: {},
    });
    helper.fixtures.generateEnvJsoncFile('custom-react/env1', {
      envPolicy: ENV_POLICY,
      componentsPolicy: COMPONENTS_POLICY
    })
    helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
    helper.bitJsonc.addKeyValToDependencyResolver('policy', {
      dependencies: {
        'is-positive': '1.0.0',
        '@types/react': '^17.0.0',
      },
    });
    helper.command.setEnv('button', 'custom-react/env1');
    helper.command.install();
    componentShowParsed = helper.command.showComponentParsed('button');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('env self policy (env prop)', () => {
    describe('affect env', () => {
      let envShowParsed;
      before(() => {
        envShowParsed = helper.command.showComponentParsed('custom-react/env1');
      });
      it('should add peers as runtime deps of the env', () => {
        expect(envShowParsed.packageDependencies).to.include({react : '^18.0.0'});
        expect(envShowParsed.packageDependencies).to.include({'react-dom' : '^18.0.0'});
        expect(envShowParsed.packageDependencies).to.include({graphql : '14.7.0'});
      });
      // TODO: implement if needed
      // it('should add devs as runtime / dev deps of the env', () => {
      // });
    })
    describe('affect component', () => {
      describe('peers effect', () => {
        it('should take supported range from env.jsonc for used peers', () => {
          expect(componentShowParsed.peerPackageDependencies).to.include({react : "^17.0.0 || ^18.0.0"});
        });
        it('should not add unused peer deps from env.jsonc', () => {
          const keys = Object.keys(componentShowParsed.peerPackageDependencies);
          // Validate we use the correct array
          expect(keys).to.be.not.empty;
          expect(keys).to.not.include('graphql');
        })
      })
      describe('devs effect', () => {
        it('should remove devs deps configured by env.jsonc from component', () => {
          const newDeps = helper.command.showComponentParsedHarmonyByTitle('button', 'dependencies');
          expect(newDeps).to.not.be.empty;
          const typesReactEntry = newDeps.find(dep => dep.id === '@types/react');
          expect(typesReactEntry).to.be.undefined;
        })

        it('should save used dep as hidden in the deps resolver deps', () => {
          const depResolverAspectEntry = helper.command.showAspectConfig('button', 'teambit.dependencies/dependency-resolver');
          const typesReactEntry = depResolverAspectEntry.data.dependencies.find(dep => dep.id === '@types/react');
          expect(typesReactEntry).to.include({'version' : "18.0.25"});
          expect(typesReactEntry).to.include({'hidden' : true});
        })

        it('should should have the dev deps with the version configured in the env.jsonc in the legacy dev deps', () => {
          expect(componentShowParsed.devPackageDependencies).to.include({'@types/react' : "18.0.25"});
        })


        // TODO: add as hidden
        it('should install used dev deps specified by the env dev deps', () => {
          const typesReactVersion =
          fs.readJsonSync(
            resolveFrom(path.join(helper.fixtures.scopes.localPath, 'button'), ['@types/react/package.json'])
          ).version
          expect(typesReactVersion).to.eq('18.0.25');
        })
      })
    })

  });
  describe('components (components prop)', () => {
    describe('detected (used) deps', () => {
      it('should take version from env.jsonc for used deps', () => {
        expect(componentShowParsed.packageDependencies).to.include({'is-positive' : "2.0.0"});
      });
      it('should install is-positive specified by the env', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(helper.fixtures.scopes.localPath, 'button'), ['is-positive/package.json'])
          ).version
        ).to.eq('2.0.0');
      });
    });
    describe('not detected (not used) deps', () => {
      it('should not add the dep to the component deps', () => {
        const keys = Object.keys(componentShowParsed.packageDependencies);
        expect(keys).to.be.not.empty;
        expect(keys).to.not.include('is-string');
      });
    });
  });
});

