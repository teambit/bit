import chai, { expect } from 'chai';
import path from 'path';
import { loadBit } from '@teambit/bit';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { BuilderMain, BuilderAspect } from '@teambit/builder';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('build command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
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
      helper.bitJsonc.setVariant(undefined, `${helper.scopes.remote}/my-env`, { 'teambit.harmony/aspect': {} });
      helper.bitJsonc.setVariant(undefined, `${helper.scopes.remote}/my-mdx`, { 'teambit.mdx/mdx': {} });
      helper.command.link();
      helper.command.compile();
      helper.command.install('react');
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

  describe.only('list tasks', () => {
    before(() => {
      helper = new Helper();
      helper.command.setFeatures(HARMONY_FEATURE);
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
      expect(tasks.snapTasks).to.have.lengthOf(0);
      expect(tasks.tagTasks).to.include('teambit.pkg/pkg:PublishComponents');
    });
  });

  describe.only('registering the publish task for the snap pipeline in a new-custom env', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.command.create('node-env', 'my-env');
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('my-scope/my-env/my-env.extension.ts', getMyEnvExtension());
      helper.bitJsonc.setVariant(undefined, 'my-scope/my-env', { 'teambit.harmony/aspect': {} });
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
});

function getMyEnvExtension() {
  return `import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { NodeAspect, NodeMain } from '@teambit/node';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { BuilderAspect, BuilderMain } from '@teambit/builder';

export class MyEnvExtension {
  constructor(private node: NodeMain) {}

  static dependencies: any = [EnvsAspect, NodeAspect, PkgAspect, BuilderAspect]

  static async provider([envs, node, pkg, builder]: [EnvsMain, NodeMain, PkgMain, BuilderMain]) {
    const MyEnvEnv = node.compose([
      /*
        Use any of the "node.override..." transformers to
      */
    ])

    envs.registerEnv(MyEnvEnv);
    builder.registerSnapTasks([pkg.publishTask]);

    return new MyEnvExtension(node)
  }
}
  `;
}
