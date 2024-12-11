import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Helper, ENV_POLICY } from '@teambit/legacy.e2e-helper';

export const ENV_POLICY_LEVEL1 = {
  peers: [
    {
      name: 'react',
      version: '^18.0.0',
      supportedRange: '^17.0.0 || ^18.0.0',
    },
    {
      name: 'react-dom',
      version: '^18.0.0',
      supportedRange: '^17.0.0 || ^18.0.0',
    },
  ],
  dev: [
    {
      name: 'is-positive',
      version: '3.1.0',
      hidden: false,
      force: true,
    },
  ],
  runtime: [
    {
      name: 'is-string',
      version: '1.0.7',
      force: true,
    },
  ],
};

const ENV_JSONC_LEVEL1 = {
  policy: ENV_POLICY_LEVEL1,
  patterns: {
    compositions: ['**/*.composition.*', '**/*.preview.*'],
    docs: ['**/*.docs.*'],
    tests: ['**/*.spec.*', '**/*.test.*'],
  },
};

export const ENV_POLICY_LEVEL2 = {
  peers: [
    {
      name: 'react',
      version: '^16.0.0',
      supportedRange: '^17.0.0 || ^16.0.0',
    },
  ],
  runtime: [
    {
      name: 'is-odd',
      version: '3.0.1',
      force: true,
    },
    {
      name: 'is-negative',
      version: '2.1.0',
      force: true,
    },
  ],
};

const ENV_JSONC_LEVEL2 = {
  policy: ENV_POLICY_LEVEL2,
  patterns: {
    compositions: ['**/*.composition.*', '**/*.preview.*', '**/*.preview-level2.*'],
    docs: ['**/*.docs.*', '**/*.docs-level2.*'],
  },
};

export const ENV_POLICY_LEVEL3 = {
  dev: [
    {
      name: 'is-negative',
      version: '2.1.0',
      force: true,
    },
  ],
  runtime: [
    {
      name: 'is-negative',
      version: '-',
      force: true,
    },
    {
      name: 'is-string',
      version: '1.0.6',
      force: true,
    },
  ],
};

const ENV_JSONC_LEVEL3 = {
  policy: ENV_POLICY_LEVEL3,
  patterns: {
    compositions: ['**/*.composition.*', '**/*.preview.*', '**/*.preview-level3.*'],
    level3: ['**/*.level3.*'],
  },
};

function generateEnvJsoncWithExtends(extendsName: string, envJsonc: object) {
  return {
    extends: extendsName,
    ...envJsonc,
  };
}

describe('env-jsonc-policies', function () {
  this.timeout(0);
  let helper: Helper;
  describe('env-jsonc base policies', function () {
    this.timeout(0);
    let componentShowParsed;
    let envId;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      envId = `${helper.scopes.remote}/react-based-env`;
      helper.command.create('react', 'button', '-p button --env teambit.react/react');
      helper.fs.prependFile('button/button.tsx', 'import isPositive from "is-positive";\n');
      helper.env.setCustomNewEnv(undefined, undefined, { policy: ENV_POLICY });
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
        expect(envShowParsed.packageDependencies).to.include({ react: '^18.0.0' });
        expect(envShowParsed.packageDependencies).to.include({ 'react-dom': '^18.0.0' });
        expect(envShowParsed.packageDependencies).to.include({ graphql: '14.7.0' });
      });
      // TODO: implement if needed
      // it('should add devs as runtime / dev deps of the env', () => {
      // });
    });
    describe('affect component', () => {
      describe('peers effect', () => {
        it('should take supported range from env.jsonc for used peers', () => {
          expect(componentShowParsed.peerPackageDependencies).to.include({ react: '^17.0.0 || ^18.0.0' });
        });
        it('should not add unused peer deps from env.jsonc', () => {
          const keys = Object.keys(componentShowParsed.peerPackageDependencies);
          // Validate we use the correct array
          expect(keys).to.be.not.empty;
          expect(keys).to.not.include('graphql');
        });
      });
      describe('devs effect', () => {
        describe('used deps', () => {
          it('should remove hidden devs deps configured by env.jsonc', () => {
            const newDeps = helper.command.showComponentParsedHarmonyByTitle('button', 'dependencies');
            expect(newDeps).to.not.be.empty;
            const typesReactEntry = newDeps.find((dep) => dep.id === '@types/react');
            expect(typesReactEntry).to.be.undefined;
          });
          it('should save used dep as hidden in the deps resolver deps', () => {
            const depResolverAspectEntry = helper.command.showAspectConfig(
              'button',
              'teambit.dependencies/dependency-resolver'
            );
            const typesReactEntry = depResolverAspectEntry.data.dependencies.find((dep) => dep.id === '@types/react');
            expect(typesReactEntry).to.include({ version: '18.0.25' });
            expect(typesReactEntry).to.include({ hidden: true });
          });
          it('should have used dev deps with the version configured in the env.jsonc in the legacy dev deps', () => {
            expect(componentShowParsed.devPackageDependencies).to.include({ '@types/react': '18.0.25' });
          });
          it('should install used dev deps specified by the env dev deps', () => {
            const typesReactVersion = fs.readJsonSync(
              resolveFrom(path.join(helper.fixtures.scopes.localPath, 'button'), ['@types/react/package.json'])
            ).version;
            expect(typesReactVersion).to.eq('18.0.25');
          });
        });
        describe('not used deps', () => {
          it('should save forced unused dep as hidden in the deps resolver deps', () => {
            const depResolverAspectEntry = helper.command.showAspectConfig(
              'button',
              'teambit.dependencies/dependency-resolver'
            );
            const typesJestEntry = depResolverAspectEntry.data.dependencies.find((dep) => dep.id === '@types/jest');
            expect(typesJestEntry).to.include({ version: '29.2.2' });
            expect(typesJestEntry).to.include({ hidden: true });
          });
          it('should have forced unused dev deps with the version configured in the env.jsonc in the legacy dev deps', () => {
            expect(componentShowParsed.devPackageDependencies).to.include({ '@types/jest': '29.2.2' });
          });
          it('should install forced unused dev deps specified by the env dev deps', () => {
            const typesJestVersion = fs.readJsonSync(
              resolveFrom(path.join(helper.fixtures.scopes.localPath, 'button'), ['@types/jest/package.json'])
            ).version;
            expect(typesJestVersion).to.eq('29.2.2');
          });
        });
      });
    });
    describe('runtime effect', () => {
      describe('not forced', () => {
        describe('detected (used) deps', () => {
          it('should take version from env.jsonc for used deps without force', () => {
            expect(componentShowParsed.packageDependencies).to.include({ 'is-positive': '2.0.0' });
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
          expect(componentShowParsed.packageDependencies).to.include({ 'is-odd': '3.0.1' });
        });
        it('should install is-odd specified by the env', () => {
          expect(
            fs.readJsonSync(resolveFrom(path.join(helper.fixtures.scopes.localPath, 'button'), ['is-odd/package.json']))
              .version
          ).to.eq('3.0.1');
        });
      });
    });
  });

  describe('env-jsonc-extends', function () {
    let componentShowParsed;
    let devFilesData;
    let envIdLevel1;
    let fullEnvIdLevel1;
    let packageNameEnvLevel1;
    let envIdLevel2;
    let fullEnvIdLevel2;
    let packageNameEnvLevel2;
    let envIdLevel3;
    let fullEnvIdLevel3;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      envIdLevel1 = 'react-based-env-level1';
      fullEnvIdLevel1 = `${helper.scopes.remote}/react-based-env-level1`;
      packageNameEnvLevel1 = `@${helper.scopes.remote}/react-based-env-level1`;
      envIdLevel2 = 'react-based-env-level2';
      fullEnvIdLevel2 = `${helper.scopes.remote}/react-based-env-level2`;
      packageNameEnvLevel2 = `@${helper.scopes.remote}/react-based-env-level2`;
      envIdLevel3 = 'react-based-env-level3';
      fullEnvIdLevel3 = `${helper.scopes.remote}/react-based-env-level3`;

      helper.env.setCustomNewEnv(undefined, undefined, ENV_JSONC_LEVEL1, false, envIdLevel1, envIdLevel1);
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        generateEnvJsoncWithExtends(packageNameEnvLevel1, ENV_JSONC_LEVEL2),
        false,
        'react-based-env-level2',
        envIdLevel2
      );
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        generateEnvJsoncWithExtends(packageNameEnvLevel2, ENV_JSONC_LEVEL3),
        false,
        'react-based-env-level3',
        envIdLevel3
      );
      helper.command.create('react', 'button', '-p button --env teambit.react/react');
      helper.fs.prependFile('button/button.tsx', 'import "react-dom";\nimport React from "react";\n');
      helper.fs.outputFile('button/my-file.preview.ts', '');
      helper.fs.outputFile('button/my-file.preview-level2.ts', '');
      helper.fs.outputFile('button/my-file.docs-level2.ts', '');
      helper.fs.outputFile('button/my-file.preview-level3.ts', '');
      helper.fs.outputFile('button/my-file.level3.ts', '');
      helper.command.setEnv('button', envIdLevel3);
      helper.command.install('@teambit/react.react-env', { a: '' });
      componentShowParsed = helper.command.showComponentParsed('button');
      const show = helper.command.showComponentParsedHarmony('button');
      const devFilesEntry = show.find((item) => item.title === 'dev files');
      devFilesData = devFilesEntry.json;
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    describe('new envs', () => {
      describe('patterns merges', () => {
        let testFiles;
        let docsFiles;
        let compositionFiles;
        before(() => {
          testFiles = devFilesData['teambit.defender/tester'];
          docsFiles = devFilesData['teambit.docs/docs'];
          compositionFiles = devFilesData['teambit.compositions/compositions'];
        });
        it('should respect patterns that exists only on first level env', () => {
          expect(testFiles).to.include('button.spec.tsx');
        });
        it('should respect patterns that exists only on second level env', () => {
          expect(docsFiles).to.include('my-file.docs-level2.ts');
        });
        it('should respect (custom) patterns that exists only on third level env', () => {
          const level3Files = devFilesData[fullEnvIdLevel3];
          expect(level3Files).to.include('my-file.level3.ts');
        });
        it('should not use patterns that defined by the second level and overriden by third level', () => {
          expect(compositionFiles).to.not.include('my-file.preview-level2.ts');
        });
        it('should respect patterns that overriden by the third level', () => {
          expect(compositionFiles).to.include('my-file.preview-level3.ts');
        });
      });
      describe('policies merges', () => {
        it('should respect peers that exists only on first level env', () => {
          expect(componentShowParsed.peerPackageDependencies).to.include({ 'react-dom': '^17.0.0 || ^18.0.0' });
        });
        it('should respect dev deps that exists only on first level env', () => {
          expect(componentShowParsed.devPackageDependencies).to.include({ 'is-positive': '3.1.0' });
        });
        it('should respect peers that overriden by the second level', () => {
          expect(componentShowParsed.peerPackageDependencies).to.include({ react: '^17.0.0 || ^16.0.0' });
        });
        it('should respect deps that only defined by the second level', () => {
          expect(componentShowParsed.packageDependencies).to.include({ 'is-odd': '3.0.1' });
        });
        it('should respect deps that defined by first and overridden by third but not by second', () => {
          expect(componentShowParsed.packageDependencies).to.include({ 'is-string': '1.0.6' });
        });
        it('should remove deps added by second, and removed by third', () => {
          expect(componentShowParsed.packageDependencies['is-negative']).to.be.undefined;
        });
        it('should respect removed by third that added as different dep type', () => {
          expect(componentShowParsed.devPackageDependencies).to.include({ 'is-negative': '2.1.0' });
        });
      });
    });
    describe('tagged envs', () => {
      let envLevel1EnvsDataInModel;
      let envLevel2EnvsDataInModel;
      let envLevel3EnvsDataInModel;

      before(() => {
        helper.command.tagAllWithoutBuild();
        envLevel1EnvsDataInModel = helper.command.getAspectsDataFromId(
          fullEnvIdLevel1,
          'teambit.envs/envs'
        ).resolvedEnvJsonc;
        envLevel2EnvsDataInModel = helper.command.getAspectsDataFromId(
          fullEnvIdLevel2,
          'teambit.envs/envs'
        ).resolvedEnvJsonc;
        envLevel3EnvsDataInModel = helper.command.getAspectsDataFromId(
          fullEnvIdLevel3,
          'teambit.envs/envs'
        ).resolvedEnvJsonc;
      });
      describe('store resolved env manifest (env.jsonc) in the model', () => {
        describe('first level env', () => {
          it('should store the resolved env.jsonc in the model', () => {
            expect(envLevel1EnvsDataInModel).to.deep.include(ENV_JSONC_LEVEL1);
          });
        });
        describe('second level env', () => {
          it('should have entries resolved from first level', () => {
            const reactDomEntry = envLevel2EnvsDataInModel.policy.peers.find((entry) => entry.name === 'react-dom');
            expect(reactDomEntry.version).to.equal('^18.0.0');
            const isStringEntry = envLevel2EnvsDataInModel.policy.runtime.find((entry) => entry.name === 'is-string');
            expect(isStringEntry.version).to.equal('1.0.7');
            const testsPattern = envLevel2EnvsDataInModel.patterns.tests;
            expect(testsPattern).to.include('**/*.spec.*');
          });
          it('should have entries resolved from self', () => {
            const reactEntry = envLevel2EnvsDataInModel.policy.peers.find((entry) => entry.name === 'react');
            expect(reactEntry.version).to.equal('^16.0.0');
            const isOddEntry = envLevel2EnvsDataInModel.policy.runtime.find((entry) => entry.name === 'is-odd');
            expect(isOddEntry.version).to.equal('3.0.1');
            const compositionsPattern = envLevel2EnvsDataInModel.patterns.compositions;
            expect(compositionsPattern).to.include('**/*.preview-level2.*');
            expect(compositionsPattern).to.include('**/*.preview.*');
            const docsPattern = envLevel2EnvsDataInModel.patterns.docs;
            expect(docsPattern).to.include('**/*.docs-level2.*');
          });
          it('should not have extends in resolved manifest', () => {
            expect(envLevel2EnvsDataInModel).to.not.have.property('extends');
          });
        });
        describe('third level env', () => {
          it('should have entries resolved from first level', () => {
            const reactDomEntry = envLevel3EnvsDataInModel.policy.peers.find((entry) => entry.name === 'react-dom');
            expect(reactDomEntry.version).to.equal('^18.0.0');
            const testsPattern = envLevel3EnvsDataInModel.patterns.tests;
            expect(testsPattern).to.include('**/*.spec.*');
          });
          it('should have entries resolved from second level', () => {
            const reactEntry = envLevel3EnvsDataInModel.policy.peers.find((entry) => entry.name === 'react');
            expect(reactEntry.version).to.equal('^16.0.0');
            const docsPattern = envLevel3EnvsDataInModel.patterns.docs;
            expect(docsPattern).to.include('**/*.docs-level2.*');
          });
          it('should have entries resolved from self', () => {
            const isNegativeSecondLevelEntry = envLevel3EnvsDataInModel.policy.runtime.find(
              (entry) => entry.name === 'is-negative'
            );
            expect(isNegativeSecondLevelEntry).to.be.undefined;
            const isNegativeEntry = envLevel3EnvsDataInModel.policy.dev.find((entry) => entry.name === 'is-negative');
            expect(isNegativeEntry.version).to.equal('2.1.0');
            const isStringEntry = envLevel3EnvsDataInModel.policy.runtime.find((entry) => entry.name === 'is-string');
            expect(isStringEntry.version).to.equal('1.0.6');

            const compositionsPattern = envLevel3EnvsDataInModel.patterns.compositions;
            expect(compositionsPattern).to.include('**/*.preview-level3.*');
            expect(compositionsPattern).to.include('**/*.preview.*');
            expect(compositionsPattern).to.not.include('**/*.preview-level2.*');
            const level3Pattern = envLevel3EnvsDataInModel.patterns.level3;
            expect(level3Pattern).to.include('**/*.level3.*');
          });
          it('should not have extends in resolved manifest', () => {
            expect(envLevel3EnvsDataInModel).to.not.have.property('extends');
          });
        });
      });
      describe('change tagged envs', () => {
        let envLevel2EnvsDataInWs;
        before(() => {
          const level2EnvJsoncPath = 'react-based-env-level2/env.jsonc';
          const level2EnvJsonc = helper.fs.readJsonFile(level2EnvJsoncPath);
          level2EnvJsonc.policy.runtime.find((entry) => entry.name === 'is-odd').version = '3.0.0';
          helper.fs.outputFile(level2EnvJsoncPath, JSON.stringify(level2EnvJsonc, null, 2));
          // @ts-ignore
          envLevel2EnvsDataInWs = helper.command.showEnvsData('react-based-env-level2').resolvedEnvJsonc;
        });
        it('should update the resolved env.jsonc in the ws data', () => {
          const isOddEntry = envLevel2EnvsDataInWs.policy.runtime.find((entry) => entry.name === 'is-odd');
          expect(isOddEntry.version).to.equal('3.0.0');
        });
        describe('re-tag modified env (only)', () => {
          before(() => {
            // We skip the auto tag as we want later to test level 3 that uses old version of level 2
            helper.command.tagWithoutBuild(envIdLevel2, '--skip-auto-tag'); // 0.0.2
          });
          it('should have the updated version in the model', () => {
            envLevel2EnvsDataInModel = helper.command.getAspectsDataFromId(
              fullEnvIdLevel2,
              'teambit.envs/envs'
            ).resolvedEnvJsonc;
            const isOddEntry = envLevel2EnvsDataInModel.policy.runtime.find((entry) => entry.name === 'is-odd');
            expect(isOddEntry.version).to.equal('3.0.0');
          });
          describe('after import', () => {
            before(() => {
              helper.command.export();
              helper.scopeHelper.reInitLocalScope();
              helper.scopeHelper.addRemoteScope();
              helper.command.importComponent(envIdLevel3);
            });
            describe('extends old version of env level2', () => {
              it('should use the old version (and policy) of the env', () => {
                envLevel3EnvsDataInModel = helper.command.getAspectsDataFromId(
                  fullEnvIdLevel3,
                  'teambit.envs/envs'
                ).resolvedEnvJsonc;
                const isOddEntry = envLevel3EnvsDataInModel.policy.runtime.find((entry) => entry.name === 'is-odd');
                expect(isOddEntry.version).to.equal('3.0.1');
              });
            });
            describe('when importing the updated version of env level2', () => {
              before(() => {
                helper.command.importComponent(envIdLevel2);
              });
              it('should use the old version (and policy) of the env', () => {
                const envLevel3ShowParsed = helper.command.showComponentParsed(fullEnvIdLevel3);
                const envLevel3EnvsDataInWs = envLevel3ShowParsed.extensions.find(
                  (ext) => ext.name === 'teambit.envs/envs'
                ).data;
                const resolvedEnvJsonc = envLevel3EnvsDataInWs.resolvedEnvJsonc;
                const isOddEntry = resolvedEnvJsonc.policy.runtime.find((entry) => entry.name === 'is-odd');
                expect(isOddEntry.version).to.equal('3.0.0');
              });
            });
          });
        });
      });
    });
  });
});
