import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import { loadBit } from '@teambit/bit';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { BuilderMain, BuilderAspect } from '@teambit/builder';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('build command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // the react-env calls the mdx, which uses the mdx env. so the build compiles this mdx
  // component twice. once by the aspect-env, triggered by the react-env component and
  // the second by the mdx-env.
  describe('an mdx dependency of a react env', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('mdx-component', 'my-mdx');
      helper.command.create('react-env', 'my-env');
      const importStatement = `import { MyMdx } from '@${helper.scopes.remote}/my-mdx';\n`;
      helper.fs.prependFile(path.join(helper.scopes.remote, 'my-env/my-env.docs.mdx'), importStatement);
      helper.bitJsonc.setVariant(undefined, `${helper.scopes.remote}/my-env`, { 'teambit.envs/env': {} });
      helper.bitJsonc.setVariant(undefined, `${helper.scopes.remote}/my-mdx`, { 'teambit.mdx/mdx': {} });
      helper.command.link();
      helper.command.compile();
      helper.command.install('react');
      helper.command.install('@teambit/documenter.theme.theme-compositions');
      helper.command.build(`--tasks teambit.compilation/compiler`);
    });
    // previously, the Babel compiler of the react-env used to run the copy process and then
    // it was coping the my-mdx.mdx file to the dists unexpectedly.
    it('should respect the shouldCopyNonSupportedFiles of the component compiler and ignore compilers of other envs', () => {
      const capsuleDir = helper.command.getCapsuleOfComponent('my-mdx');
      const capsuleDist = path.join(capsuleDir, 'dist');
      expect(capsuleDist).to.be.a.directory();
      const filePath = path.join(capsuleDist, 'my-mdx.mdx');
      expect(filePath).to.not.be.a.path();
    });
  });

  describe('list tasks', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.fixtures.populateComponents(1);
    });
    it('should list the publish task in the tagPipeline but not in the snapPipeline', async () => {
      const harmony = await loadBit(helper.scopes.localPath);
      const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
      const compId = await workspace.resolveComponentId('comp1');
      const component = await workspace.get(compId);
      const builder = harmony.get<BuilderMain>(BuilderAspect.id);
      const tasks = builder.listTasks(component);
      expect(tasks.snapTasks).to.not.include('teambit.pkg/pkg:PublishComponents');
      expect(tasks.tagTasks).to.include('teambit.pkg/pkg:PublishComponents');
    });
  });

  describe('registering the publish task for the snap pipeline in a new-custom env', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.command.create('node-env', 'my-env');
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('my-scope/my-env/my-env.main.runtime.ts', getMyEnvMainRuntime());
      helper.bitJsonc.setVariant(undefined, 'my-scope/my-env', { 'teambit.envs/env': {} });
      helper.bitJsonc.setVariant(undefined, 'comp1', { 'my-scope/my-env': {} });
      helper.command.compile();
      helper.command.install();
    });
    it('should list the publish task in the tagPipeline AND in the snapPipeline as well', async () => {
      const harmony = await loadBit(helper.scopes.localPath);
      const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
      const compId = await workspace.resolveComponentId('comp1');
      const component = await workspace.get(compId);
      const builder = harmony.get<BuilderMain>(BuilderAspect.id);
      const tasks = builder.listTasks(component);
      expect(tasks.snapTasks).to.include('teambit.pkg/pkg:PublishComponents');
    });
  });

  describe('dist file is deleted from the remote', () => {
    let errorOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1');

      const artifacts = helper.command.getArtifacts(`${helper.scopes.remote}/comp1`);
      const artifactDist = artifacts.find((a) => a.name === 'dist');
      const artifactDistFile = artifactDist.files[0].file;
      const artifactPath = path.join(
        helper.scopes.remotePath,
        'objects',
        helper.general.getHashPathOfObject(artifactDistFile)
      );
      fs.removeSync(artifactPath);
      errorOutput = helper.general.runWithTryCatch('bit build comp1');
    });
    it('the error should mention the remote where the error is coming from', () => {
      expect(errorOutput).to.have.string(helper.scopes.remote);
    });
    it('the error should explain the issue', () => {
      expect(errorOutput).to.have.string(`unable to get the following objects`);
    });
  });
});

function getMyEnvMainRuntime() {
  return `import { MainRuntime } from '@teambit/cli';
import { NodeAspect, NodeMain } from '@teambit/node'
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { MyEnvAspect } from './my-env.aspect';
//import {
//  previewConfigTransformer,
//  devServerConfigTransformer
//} from './webpack/webpack-transformers';
//import {
//  devConfigTransformer,
//  buildConfigTransformer,
//} from "./typescript/ts-transformers";

export class MyEnvMain {
  static slots = [];

  static dependencies = [NodeAspect, EnvsAspect, PkgAspect, BuilderAspect];

  static runtime = MainRuntime;

  //const webpackModifiers: UseWebpackModifiers = {
  //  previewConfig: [previewConfigTransformer],
  //  devServerConfig: [devServerConfigTransformer],
  //};

  //const tsModifiers: UseTypescriptModifiers = {
  //  devConfig: [devConfigTransformer],
  //  buildConfig: [buildConfigTransformer],
  //};

  static async provider([node, envs, pkg, builder]: [NodeMain, EnvsMain, PkgMain, BuilderMain]) {
    const MyEnvEnv = node.compose([
      /**
       * Uncomment to override the config files for TypeScript, Webpack or Jest
       * Your config gets merged with the defaults
       */

      // node.useTypescript(tsModifiers),  // note: this cannot be used in conjunction with node.overrideCompiler
      // node.useWebpack(webpackModifiers),
      // node.overrideJestConfig(require.resolve('./jest/jest.config')),

      /**
       * override the ESLint default config here then check your files for lint errors
       * @example
       * bit lint
       * bit lint --fix
       */
      node.useEslint({
        transformers: [
          (config) => {
            config.setRule('no-console', ['error']);
            return config;
          }
        ]
      }),

      /**
       * override the Prettier default config here the check your formatting
       * @example
       * bit format --check
       * bit format
       */
      node.usePrettier({
        transformers: [
          (config) => {
            config.setKey('tabWidth', 2);
            return config;
          }
        ]
      }),

      /**
       * override dependencies here
       * @example
       * Uncomment types to include version 17.0.3 of the types package
       */
      node.overrideDependencies({
        devDependencies: {
          // '@types/node': '16.11.7'
        }
      })
    ]);
    envs.registerEnv(MyEnvEnv);
    builder.registerSnapTasks([pkg.publishTask]);
    return new MyEnvMain();
  }
}

MyEnvAspect.addRuntime(MyEnvMain);
`;
}
