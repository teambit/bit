import fs from 'fs';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { DEPS_GRAPH } from '@teambit/harmony.modules.feature-toggle';
import { addDistTag } from '@pnpm/registry-mock';
import path from 'path';
import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import yaml from 'js-yaml';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);

(supportNpmCiRegistryTesting ? describe : describe.skip)('dependencies graph data', function () {
  this.timeout(0);
  let npmCiRegistry: NpmCiRegistry;
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(DEPS_GRAPH);
  });
  after(() => {
    helper.scopeHelper.destroy();
    helper.command.resetFeatures();
  });
  describe('two components with different peer dependencies', function () {
    const env1DefaultPeerVersion = '16.0.0';
    const env2DefaultPeerVersion = '17.0.0';
    let randomStr: string;
    before(async () => {
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());

      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: 'react',
                version: env1DefaultPeerVersion,
                supportedRange: '^16.0.0',
              },
            ],
          },
        },
        false,
        'custom-react/env1',
        'custom-react/env1'
      );
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: 'react',
                version: env2DefaultPeerVersion,
                supportedRange: '^17.0.0',
              },
            ],
          },
        },
        false,
        'custom-react/env2',
        'custom-react/env2'
      );

      helper.fixtures.populateComponents(2);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      await addDistTag({ package: '@pnpm.e2e/foo', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.0.0', distTag: 'latest' });
      helper.fs.outputFile(
        `comp1/index.js`,
        `const React = require("react"); require("@pnpm.e2e/foo"); // eslint-disable-line`
      );
      helper.fs.outputFile(
        `comp2/index.js`,
        `const React = require("react");const comp1 = require("@ci/${randomStr}.comp1"); require("@pnpm.e2e/bar"); // eslint-disable-line`
      );
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-react/env1`, {});
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-react/env2`, {});
      helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
      helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          '@pnpm.e2e/foo': '^100.0.0',
          '@pnpm.e2e/bar': '^100.0.0',
        },
      });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('should save dependencies graph to the model of comp1', () => {
      const versionObj = helper.command.catComponent('comp1@latest');
      const depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
      const directDependencies = depsGraph.edges.find((edge) => edge.id === '.').neighbours;
      expect(directDependencies).deep.include({
        name: 'react',
        specifier: '16.0.0',
        id: 'react@16.0.0',
        lifecycle: 'runtime',
        optional: false,
      });
    });
    let depsGraph2;
    let depsGraph2DirectDeps;
    let comp1Package;
    it('should save dependencies graph to the model comp2', () => {
      const versionObj = helper.command.catComponent('comp2@latest');
      depsGraph2 = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
      depsGraph2DirectDeps = depsGraph2.edges.find((edge) => edge.id === '.').neighbours;
      expect(depsGraph2DirectDeps).deep.include({
        name: 'react',
        specifier: '17.0.0',
        id: 'react@17.0.0',
        lifecycle: 'runtime',
        optional: false,
      });
    });
    it('should replace pending version in direct dependency', () => {
      expect(depsGraph2DirectDeps).deep.include({
        name: `@ci/${randomStr}.comp1`,
        specifier: '*',
        id: `@ci/${randomStr}.comp1@0.0.1(react@17.0.0)`,
        lifecycle: 'runtime',
        optional: false,
      });
    });
    it('should update integrity of dependency component', () => {
      comp1Package = depsGraph2.packages[`@ci/${randomStr}.comp1@0.0.1`];
      expect(comp1Package.resolution.integrity).to.match(/^sha512-/);
    });
    it('should add component ID to the deps graph', () => {
      expect(comp1Package.component).to.eql({ scope: helper.scopes.remote, name: 'comp1' });
    });
    describe('importing a component that depends on another component and was export together with that component', () => {
      before(async () => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        await addDistTag({ package: '@pnpm.e2e/foo', version: '100.1.0', distTag: 'latest' });
        await addDistTag({ package: '@pnpm.e2e/bar', version: '100.1.0', distTag: 'latest' });
        helper.command.import(`${helper.scopes.remote}/comp2@latest`);
      });
      let lockfile: any;
      it('should generate a lockfile', () => {
        lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
        expect(lockfile.bit.restoredFromModel).to.eq(true);
      });
      it('should import the component with its own resolved versions', () => {
        expect(lockfile.packages).to.not.have.property('@pnpm.e2e/foo@100.1.0');
        expect(lockfile.packages).to.not.have.property('@pnpm.e2e/bar@100.1.0');
        expect(lockfile.packages).to.have.property('@pnpm.e2e/foo@100.0.0');
        expect(lockfile.packages).to.have.property('@pnpm.e2e/bar@100.0.0');
      });
    });
  });
  describe('two components exported with different peer dependencies using the same env', function () {
    let randomStr: string;
    before(async () => {
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: '@pnpm.e2e/abc',
                version: '*',
                supportedRange: '*',
              },
            ],
          },
        },
        false,
        'custom-env/env',
        'custom-env/env'
      );
      helper.fs.createFile('bar', 'bar.js', 'require("@pnpm.e2e/abc"); // eslint-disable-line');
      helper.command.addComponent('bar');
      helper.extensions.addExtensionToVariant('bar', `${helper.scopes.remote}/custom-env/env`, {});
      await addDistTag({ package: '@pnpm.e2e/abc', version: '1.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/peer-a', version: '1.0.1', distTag: 'latest' });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      await addDistTag({ package: '@pnpm.e2e/abc', version: '2.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/peer-a', version: '1.0.0', distTag: 'latest' });
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.fs.createFile('foo', 'foo.js', `require("@pnpm.e2e/abc"); require("@ci/${randomStr}.bar");`);
      helper.command.addComponent('foo');
      helper.extensions.addExtensionToVariant('foo', `${helper.scopes.remote}/custom-env/env@0.0.1`, {});
      helper.command.install('--add-missing-deps');
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/foo@latest ${helper.scopes.remote}/bar@latest`);
    });
    let lockfile: any;
    it('should generate a lockfile', () => {
      lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
      expect(lockfile.bit.restoredFromModel).to.eq(true);
    });
    it('should resolve to one version of the peer dependency, the highest one', () => {
      expect(lockfile.packages).to.not.have.property('@pnpm.e2e/peer-a@1.0.0');
      expect(lockfile.packages).to.not.have.property('@pnpm.e2e/abc@1.0.0');
      expect(lockfile.packages).to.have.property('@pnpm.e2e/peer-a@1.0.1');
      expect(lockfile.packages).to.have.property('@pnpm.e2e/abc@2.0.0');
    });
    it('imported component is not installed as a dependency', () => {
      expect(lockfile.packages).to.not.have.property(`@ci/${randomStr}.bar@0.0.1`);
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
  });
  // Covers the "reimport drift" path: when a second component is imported into a
  // workspace that already has installed components, the graph-generated lockfile must
  // not overwrite pnpm-lock.yaml with only the newly-imported component's subgraph — if
  // it did, existing workspace dependencies would be re-resolved by pnpm against the
  // manifest specifiers and drift to newer registry versions.
  describe('importing a component into a workspace that already has an installed component', function () {
    let randomStr: string;
    let initialLockfile: any;
    let lockfileAfterSecondImport: any;
    before(async () => {
      randomStr = generateRandomStr(4);
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        { policy: { peers: [] } },
        false,
        'custom-env/env',
        'custom-env/env'
      );
      helper.fs.createFile('comp1', 'comp1.js', 'require("@pnpm.e2e/foo"); // eslint-disable-line');
      helper.command.addComponent('comp1');
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env`, {});
      helper.fs.createFile('comp2', 'comp2.js', 'require("@pnpm.e2e/bar"); // eslint-disable-line');
      helper.command.addComponent('comp2');
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-env/env`, {});
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      await addDistTag({ package: '@pnpm.e2e/foo', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.0.0', distTag: 'latest' });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.import(`${helper.scopes.remote}/comp1@latest`);
      initialLockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));

      await addDistTag({ package: '@pnpm.e2e/foo', version: '100.1.0', distTag: 'latest' });

      helper.command.import(`${helper.scopes.remote}/comp2@latest`);
      lockfileAfterSecondImport = yaml.load(
        fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8')
      );
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('first import should restore the lockfile from comp1 graph', () => {
      expect(initialLockfile.bit.restoredFromModel).to.eq(true);
      expect(initialLockfile.packages).to.have.property('@pnpm.e2e/foo@100.0.0');
    });
    it('second import should include comp2 deps at the versions stored in its graph', () => {
      expect(lockfileAfterSecondImport.packages).to.have.property('@pnpm.e2e/bar@100.0.0');
    });
    // Regression coverage: graph-based lockfile regeneration previously overwrote
    // pnpm-lock.yaml with only comp2's subgraph, causing foo to be re-resolved from the
    // manifest specifier and drift to the newer registry version.
    it('second import should preserve comp1 deps at their previously-locked versions', () => {
      expect(lockfileAfterSecondImport.packages).to.have.property('@pnpm.e2e/foo@100.0.0');
      expect(lockfileAfterSecondImport.packages).to.not.have.property('@pnpm.e2e/foo@100.1.0');
    });
  });
  // Same class of drift as the previous block, but for the "pull updated version of an
  // already-imported component" path. Only the re-imported component's IDs are passed to
  // installPackagesGracefully, so only its graph is used to regenerate the lockfile — the
  // merge helper has to preserve unrelated components' previously-locked deps.
  describe('re-importing an updated version of an already-imported component', function () {
    let randomStr: string;
    let lockfileAfterReimport: any;
    before(async () => {
      randomStr = generateRandomStr(4);
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        { policy: { peers: [] } },
        false,
        'custom-env/env',
        'custom-env/env'
      );
      helper.fs.createFile('comp1', 'comp1.js', 'require("@pnpm.e2e/foo"); // eslint-disable-line');
      helper.command.addComponent('comp1');
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env`, {});
      helper.fs.createFile('comp2', 'comp2.js', 'require("@pnpm.e2e/bar"); // eslint-disable-line');
      helper.command.addComponent('comp2');
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-env/env`, {});
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      await addDistTag({ package: '@pnpm.e2e/foo', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.0.0', distTag: 'latest' });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      helper.fs.appendFile('comp1/comp1.js', '\nmodule.exports = 1;');
      helper.command.tagAllComponents('--skip-tests --unmodified');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.import(`${helper.scopes.remote}/comp1@0.0.1 ${helper.scopes.remote}/comp2@latest`);

      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.1.0', distTag: 'latest' });

      helper.command.import(`${helper.scopes.remote}/comp1@latest`);
      lockfileAfterReimport = yaml.load(
        fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8')
      );
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    // Regression coverage: re-importing comp1 must not regenerate the lockfile from
    // comp1's graph only and drop comp2's bar entry. Otherwise pnpm may re-resolve bar
    // from the manifest specifier and drift to the newer registry version.
    it('should preserve comp2 dependency versions that are unrelated to the re-imported component', () => {
      expect(lockfileAfterReimport.packages).to.have.property('@pnpm.e2e/bar@100.0.0');
      expect(lockfileAfterReimport.packages).to.not.have.property('@pnpm.e2e/bar@100.1.0');
    });
  });
  describe('three components sharing a peer dependency', function () {
    let randomStr: string;
    let lockfile: any;
    before(async () => {
      randomStr = generateRandomStr(4);
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: '@pnpm.e2e/abc',
                version: '*',
                supportedRange: '*',
              },
            ],
          },
        },
        false,
        'custom-env/env',
        'custom-env/env'
      );
      helper.fs.createFile('bar', 'bar.js', 'require("@pnpm.e2e/abc"); // eslint-disable-line');
      helper.command.addComponent('bar');
      helper.extensions.addExtensionToVariant('bar', `${helper.scopes.remote}/custom-env/env`, {});
      await addDistTag({ package: '@pnpm.e2e/abc', version: '1.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/peer-a', version: '1.0.0', distTag: 'latest' });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      await addDistTag({ package: '@pnpm.e2e/abc', version: '2.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/peer-a', version: '1.0.1', distTag: 'latest' });
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.fs.createFile('foo', 'foo.js', `require("@pnpm.e2e/abc"); require("@ci/${randomStr}.bar");`);
      helper.command.addComponent('foo');
      helper.extensions.addExtensionToVariant('foo', `${helper.scopes.remote}/custom-env/env@0.0.1`, {});
      helper.command.install('--add-missing-deps');
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
      helper.command.export();

      // A third component re-uses one of the already-published versions (peer-a@1.0.0)
      // so the merge has to reconcile three graphs where two of them agree on the lower
      // version and one carries the higher version.
      await addDistTag({ package: '@pnpm.e2e/abc', version: '1.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/peer-a', version: '1.0.0', distTag: 'latest' });
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.fs.createFile('baz', 'baz.js', `require("@pnpm.e2e/abc"); require("@ci/${randomStr}.bar");`);
      helper.command.addComponent('baz');
      helper.extensions.addExtensionToVariant('baz', `${helper.scopes.remote}/custom-env/env@0.0.1`, {});
      helper.command.install('--add-missing-deps');
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(
        `${helper.scopes.remote}/foo@latest ${helper.scopes.remote}/bar@latest ${helper.scopes.remote}/baz@latest`
      );
      lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('should restore the lockfile from the merged graphs', () => {
      expect(lockfile.bit.restoredFromModel).to.eq(true);
    });
    // The root edge of the merged graph picks the highest peer version per (name, specifier),
    // so the highest variant must be present in the lockfile.
    it('should include the highest version of the shared peer dependency across all three graphs', () => {
      expect(lockfile.packages).to.have.property('@pnpm.e2e/abc@2.0.0');
      expect(lockfile.packages).to.have.property('@pnpm.e2e/peer-a@1.0.1');
    });
    // Documents a known limitation of the merge: highest-wins is applied only to the root
    // edge. Transitive snapshots from lower-version graphs still reference the older
    // versions of non-peer packages, so pnpm retains them in the lockfile. (Peer versions
    // get reconciled across the workspace at install time, so they don't leak; regular
    // dependencies do.)
    it('currently leaves the lower version of non-peer transitives in the lockfile', () => {
      expect(lockfile.packages).to.have.property('@pnpm.e2e/abc@1.0.0');
    });
  });
  // Regression coverage for devDependencies + optionalDependencies round-trip through
  // the graph. The graph edge neighbours carry `lifecycle` and `optional` flags; these
  // must make it back into the regenerated lockfile's importer entries and snapshots.
  describe('dev and optional dependencies round-trip through the graph', function () {
    let randomStr: string;
    let depsGraph: any;
    let lockfile: any;
    before(async () => {
      randomStr = generateRandomStr(4);
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            dev: [
              {
                name: '@pnpm.e2e/foo',
                version: '100.0.0',
                hidden: true,
                force: true,
              },
            ],
          },
        },
        false,
        'custom-env/env',
        'custom-env/env'
      );
      helper.fs.createFile('comp1', 'comp1.js', 'require("@pnpm.e2e/bar"); // eslint-disable-line');
      helper.command.addComponent('comp1');
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env`, {});
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      await addDistTag({ package: '@pnpm.e2e/foo', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.0.0', distTag: 'latest' });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      const versionObj = helper.command.catComponent('comp1@latest');
      depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.import(`${helper.scopes.remote}/comp1@latest`);
      lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('should record the dev-only dependency in the graph with lifecycle=dev', () => {
      const directDependencies = depsGraph.edges.find((edge) => edge.id === '.').neighbours;
      const fooDep = directDependencies.find((dep) => dep.name === '@pnpm.e2e/foo');
      expect(fooDep, 'foo should be a direct dependency in the graph').to.exist;
      expect(fooDep.lifecycle).to.eq('dev');
    });
    it('should record the runtime dependency in the graph with lifecycle=runtime', () => {
      const directDependencies = depsGraph.edges.find((edge) => edge.id === '.').neighbours;
      const barDep = directDependencies.find((dep) => dep.name === '@pnpm.e2e/bar');
      expect(barDep, 'bar should be a direct dependency in the graph').to.exist;
      expect(barDep.lifecycle).to.eq('runtime');
    });
    it('should restore the lockfile from the graph', () => {
      expect(lockfile.bit.restoredFromModel).to.eq(true);
      expect(lockfile.packages).to.have.property('@pnpm.e2e/foo@100.0.0');
      expect(lockfile.packages).to.have.property('@pnpm.e2e/bar@100.0.0');
    });
  });
  // `bit install --restore` seeds the lockfile from the dependency graphs stored on
  // every bitmap entry, the same way `bit import` does for the components it writes.
  // This lets a user recover from a deleted pnpm-lock.yaml without re-resolving from
  // manifest specifiers (which would drift to whatever the registry considers latest).
  describe('bit install --restore rebuilds the lockfile from workspace component graphs', function () {
    let randomStr: string;
    let lockfileAfterRestore: any;
    before(async () => {
      randomStr = generateRandomStr(4);
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        { policy: { peers: [] } },
        false,
        'custom-env/env',
        'custom-env/env'
      );
      helper.fs.createFile('comp1', 'comp1.js', 'require("@pnpm.e2e/foo"); // eslint-disable-line');
      helper.command.addComponent('comp1');
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env`, {});
      helper.fs.createFile('comp2', 'comp2.js', 'require("@pnpm.e2e/bar"); // eslint-disable-line');
      helper.command.addComponent('comp2');
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-env/env`, {});
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      await addDistTag({ package: '@pnpm.e2e/foo', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.0.0', distTag: 'latest' });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.import(`${helper.scopes.remote}/comp1@latest ${helper.scopes.remote}/comp2@latest`);

      // bump registry and blow away the lockfile + node_modules, then restore from graphs.
      await addDistTag({ package: '@pnpm.e2e/foo', version: '100.1.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.1.0', distTag: 'latest' });
      helper.fs.deletePath('pnpm-lock.yaml');
      helper.fs.deletePath('node_modules');
      helper.command.runCmd('bit install --restore');
      lockfileAfterRestore = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('should mark the regenerated lockfile as restoredFromModel', () => {
      expect(lockfileAfterRestore.bit.restoredFromModel).to.eq(true);
    });
    it('should keep both components locked to the versions stored in their graphs', () => {
      expect(lockfileAfterRestore.packages).to.have.property('@pnpm.e2e/foo@100.0.0');
      expect(lockfileAfterRestore.packages).to.have.property('@pnpm.e2e/bar@100.0.0');
      expect(lockfileAfterRestore.packages).to.not.have.property('@pnpm.e2e/foo@100.1.0');
      expect(lockfileAfterRestore.packages).to.not.have.property('@pnpm.e2e/bar@100.1.0');
    });
  });
});
