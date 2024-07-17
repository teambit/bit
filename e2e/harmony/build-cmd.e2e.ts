import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import { loadBit } from '@teambit/bit';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { BuilderMain, BuilderAspect } from '@teambit/builder';
import { Helper } from '@teambit/legacy.e2e-helper';

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
      helper.scopeHelper.reInitLocalScope();
      helper.command.create('mdx', 'my-mdx', '--env teambit.mdx/mdx');
      helper.env.setCustomEnv('custom-react-env');
      const importStatement = `import { MyMdx } from '@${helper.scopes.remote}/my-mdx';\n`;
      helper.fs.prependFile(path.join('custom-react-env/custom-react-env.docs.mdx'), importStatement);
      helper.workspaceJsonc.setVariant(undefined, `${helper.scopes.remote}/my-mdx`, { 'teambit.mdx/mdx': {} });
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.reInitLocalScope({ addRemoteScopeAsDefaultScope: false });
      helper.env.setCustomEnv();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('node-env/node-env.extension.ts', getNodeEnvExtension());
      helper.workspaceJsonc.setVariant(undefined, 'comp1', { 'my-scope/node-env': {} });
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
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

  describe('3 components use 3 different envs', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
      helper.command.setEnv('comp2', 'teambit.react/react');
      helper.command.setEnv('comp3', 'teambit.harmony/node');
      helper.command.tagAllWithoutBuild();
      helper.fs.appendFile('comp2/index.js');
    });
    it('should indicate when executing a build task on a dependency', () => {
      const output = helper.command.build();
      expect(output).to.have.string('[dependency] (node)');
    });
  });
});

function getNodeEnvExtension() {
  return `import { EnvsMain, EnvsAspect } from '@teambit/envs';
  import { NodeMain, NodeAspect } from '@teambit/node';
  import { BuilderAspect, BuilderMain } from '@teambit/builder';
  import { PkgAspect, PkgMain } from '@teambit/pkg';

  export class NodeEnv {
    constructor(private node: NodeMain) {}

    static dependencies: any = [EnvsAspect, NodeAspect, BuilderAspect, PkgAspect];

    static async provider([envs, node, builder, pkg]: [EnvsMain, NodeMain, BuilderMain, PkgMain]) {
      const nodeEnv = node.compose([]);

      envs.registerEnv(nodeEnv);
      builder.registerSnapTasks([pkg.publishTask]);
      return new NodeEnv(node);
    }
  }
`;
}
