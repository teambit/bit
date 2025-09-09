import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
import { loadBit } from '@teambit/bit';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { BuilderMain } from '@teambit/builder';
import { BuilderAspect } from '@teambit/builder';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import { specFileFailingFixture } from './jest-fixtures';

chai.use(chaiFs);
chai.use(chaiString);

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
      helper.scopeHelper.reInitWorkspace();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
    });
    it('should list the publish task in the tagPipeline and in the snapPipeline', async () => {
      const harmony = await loadBit(helper.scopes.localPath);
      const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
      const compId = await workspace.resolveComponentId('comp1');
      const component = await workspace.get(compId);
      const builder = harmony.get<BuilderMain>(BuilderAspect.id);
      const tasks = builder.listTasks(component);
      expect(tasks.snapTasks).to.include('teambit.pkg/pkg:PublishComponents');
      expect(tasks.tagTasks).to.include('teambit.pkg/pkg:PublishComponents');
    });
  });

  describe('registering the publish task for the snap pipeline in a new-custom env', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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

  describe('bit build with --loose flag', () => {
    describe('component with a failing test', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(1);
        helper.fs.outputFile('comp1/comp1.spec.ts', specFileFailingFixture());
      });
      it('bit build --loose should not throw and show the failing test but indicate build success', () => {
        const output = helper.command.build(undefined, '--loose', true);
        expect(output).to.have.string('task "teambit.defender/tester:JestTest" has failed'); // Should still show the failing task
        expect(output).to.have.string('should fail'); // Should still show the failing test
        expect(output).to.have.string('build succeeded'); // But build should succeed
      });
    });
    describe('component with a compilation error', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(1);
        // Create a TypeScript file with a compilation error
        helper.fs.outputFile('comp1/comp1.ts', 'export function invalidFunction(): string { return 123; }');
        helper.fs.outputFile('comp1/index.ts', 'export { invalidFunction } from "./comp1";');
      });
      it('bit build --loose should still throw an error for compilation errors', () => {
        expect(() => helper.command.build(undefined, '--loose')).to.throw();
      });
    });
  });

  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'optimized capsule creation for exported dependencies',
    () => {
      let npmCiRegistry: NpmCiRegistry;
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();

        // Create 3 dependent components: comp1 -> comp2 -> comp3
        helper.fixtures.populateComponents(3);

        // Tag and export all components (this will publish them to local registry)
        helper.command.tagAllComponents();
        helper.command.export();

        // Only modify comp2 to trigger rebuild
        helper.fs.appendFile('comp2/index.js', '\n// modification to comp2');
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('should only create capsules for modified components and their dependents, not for unmodified exported dependencies', () => {
        helper.command.build();

        // comp1 and comp2 should have capsules since comp1 depends on modified comp2
        const comp1Capsule = helper.command.getCapsuleOfComponent(`${helper.scopes.remote}/comp1@0.0.1`);
        const comp2Capsule = helper.command.getCapsuleOfComponent(`${helper.scopes.remote}/comp2@0.0.1`);
        expect(comp1Capsule).to.be.a.directory();
        expect(comp2Capsule).to.be.a.directory();

        // comp3 should NOT have a capsule since it's an unmodified exported dependency
        // Instead, comp3 should be available as a package in the capsule node_modules
        expect(() => helper.command.getCapsuleOfComponent(`${helper.scopes.remote}/comp3@0.0.1`)).to.throw();

        // comp3 should be available as a package in the root of node_modules
        const comp2NodeModules = path.join(
          comp2Capsule,
          '..',
          'node_modules',
          helper.general.getPackageNameByCompName('comp3', true)
        );
        expect(comp2NodeModules).to.be.a.directory();
      });
    }
  );
  describe('optimized capsule creation for exported dependencies for self hosting', () => {
    before(async () => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllComponents();
      helper.command.export();

      // Only modify comp2 to trigger rebuild
      helper.fs.appendFile('comp2/index.js', '\n// modification to comp2');
    });
    it('should create capsules not only for modified components and their dependents, but also for unmodified exported dependencies', () => {
      helper.command.build();

      // comp1 and comp2 should have capsules since comp1 depends on modified comp2
      const comp1Capsule = helper.command.getCapsuleOfComponent(`${helper.scopes.remote}/comp1@0.0.1`);
      const comp2Capsule = helper.command.getCapsuleOfComponent(`${helper.scopes.remote}/comp2@0.0.1`);
      const comp3Capsule = helper.command.getCapsuleOfComponent(`${helper.scopes.remote}/comp3@0.0.1`);
      expect(comp1Capsule).to.be.a.directory();
      expect(comp2Capsule).to.be.a.directory();
      expect(comp3Capsule).to.be.a.directory();
    });
  });

  describe('build should only include workspace components and direct dependents', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // Create 3 components: comp1 -> comp2 -> comp3 (comp1 uses comp2, comp2 uses comp3)
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // Create a new workspace and import only comp1 and comp3 (not comp2)
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1', '-x');
      helper.command.importComponent('comp3');
      helper.npm.addFakeNpmPackage(`@${helper.scopes.remote}/comp2`, '0.0.1', true);

      // Modify comp3 to trigger a build
      helper.fs.appendFile(path.join(helper.scopes.remote, 'comp3/index.js'), '\n// modification to comp3');
    });
    it('should only include modified component (comp3) in build, not its dependents through non-workspace components', () => {
      const output = helper.command.build();

      // Should include comp3 since it was modified
      expect(output).to.have.string('comp3');

      // Should NOT include comp1, even though comp1 depends on comp2 which depends on comp3,
      // because comp2 is not in the workspace (it's an external dependency)
      expect(output).to.not.have.string('comp1');

      expect(output).to.have.string('Total 1 components to build');
    });
  });

  describe('build with --unmodified flag and component pattern', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // Create 2 independent components (not related to each other)
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp2/index.js', 'module.exports = function comp2() { return "comp2"; }');
      helper.command.add('comp2');
      helper.command.tagAllWithoutBuild();
    });
    it('should only build the specified component when using --unmodified with a component pattern', () => {
      const output = helper.command.build('comp1 --unmodified');

      // Should include comp1 since it was specified
      expect(output).to.have.string('comp1');

      // Should NOT include comp2, even with --unmodified flag
      expect(output).to.not.have.string('comp2');

      expect(output).to.have.string('Total 1 components to build');
    });
    it('should build both components when using --unmodified without a pattern', () => {
      const output = helper.command.build('--unmodified');

      // Should include both components
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');

      expect(output).to.have.string('Total 2 components to build');
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
