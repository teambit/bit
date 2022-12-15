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
  dev: [
    {
      name: '@types/react',
      version: '18.0.25',
      hidden: true,
      force: true
    },
    {
      name: '@types/react-dom',
      version: '^18.0.0',
      hidden: true,
      force: true
    },
    {
      name: '@types/jest',
      version: '29.2.2',
      hidden: true,
      force: true
    },
  ],
  runtime: [
    {
      name: 'is-positive',
      version: '2.0.0',
    },
    {
      name: 'is-string',
      version: '1.0.7',
    },
    {
      name: 'is-odd',
      version: '3.0.1',
      force: true
    },
  ]
}

describe('env-jsonc-policies', function () {
  this.timeout(0);
  let helper: Helper;
  let componentShowParsed;
  let envId;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    envId = `${helper.scopes.remote}/react-based-env`;
    helper.command.create('react', 'button', '-p button');
    helper.fs.prependFile('button/button.tsx', 'import isPositive from "is-positive";\n');
    helper.env.setCustomNewEnv(undefined, undefined, {policy: ENV_POLICY});
    helper.command.setEnv('button', envId);
    helper.command.install();
    componentShowParsed = helper.command.showComponentParsed('button');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('affect env', () => {
    let envShowParsed;
    before(() => {
      envShowParsed = helper.command.showComponentParsed('react-based-env');
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
      describe('used deps', () => {
        it('should remove hidden devs deps configured by env.jsonc', () => {
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

        it('should have used dev deps with the version configured in the env.jsonc in the legacy dev deps', () => {
          expect(componentShowParsed.devPackageDependencies).to.include({'@types/react' : "18.0.25"});
        })

        it('should install used dev deps specified by the env dev deps', () => {
          const typesReactVersion =
          fs.readJsonSync(
            resolveFrom(path.join(helper.fixtures.scopes.localPath, 'button'), ['@types/react/package.json'])
          ).version
          expect(typesReactVersion).to.eq('18.0.25');
        })
      })
      describe('not used deps', () => {
        it('should save forced unused dep as hidden in the deps resolver deps', () => {
          const depResolverAspectEntry = helper.command.showAspectConfig('button', 'teambit.dependencies/dependency-resolver');
          const typesJestEntry = depResolverAspectEntry.data.dependencies.find(dep => dep.id === '@types/jest');
          expect(typesJestEntry).to.include({'version' : "29.2.2"});
          expect(typesJestEntry).to.include({'hidden' : true});
        })

        it('should have forced unused dev deps with the version configured in the env.jsonc in the legacy dev deps', () => {
          expect(componentShowParsed.devPackageDependencies).to.include({'@types/jest' : "29.2.2"});
        })

        it('should install forced unused dev deps specified by the env dev deps', () => {
          const typesJestVersion =
          fs.readJsonSync(
            resolveFrom(path.join(helper.fixtures.scopes.localPath, 'button'), ['@types/jest/package.json'])
          ).version
          expect(typesJestVersion).to.eq('29.2.2');
        })
      })
    })
  })
  describe('runtime effect', () => {
    describe('not forced', () => {
      describe('detected (used) deps', () => {
        it('should take version from env.jsonc for used deps without force', () => {
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
    describe('forced', () => {
      it('should take version from env.jsonc for unused deps', () => {
        expect(componentShowParsed.packageDependencies).to.include({'is-odd' : "3.0.1"});
      });
      it('should install is-odd specified by the env', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(helper.fixtures.scopes.localPath, 'button'), ['is-odd/package.json'])
          ).version
        ).to.eq('3.0.1');
      });
    })
  })

});

