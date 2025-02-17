import fs from 'fs';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { DEPS_GRAPH } from '@teambit/harmony.modules.feature-toggle';
import { addDistTag } from '@pnpm/registry-mock';
import { type LockfileFileV9 } from '@pnpm/lockfile.types';
import path from 'path';
import chai, { expect } from 'chai';
import stripAnsi from 'strip-ansi';
import yaml from 'js-yaml';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

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
  describe('single component', () => {
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react"); require('@pnpm.e2e/pkg-with-1-dep')`);
      helper.fs.outputFile(
        `comp1/index.spec.js`,
        `const isOdd = require("is-odd"); test('test', () => { expect(1).toEqual(1); })`
      );
      await addDistTag({ package: '@pnpm.e2e/pkg-with-1-dep', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/dep-of-pkg-with-1-dep', version: '100.0.0', distTag: 'latest' });
      helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          '@pnpm.e2e/pkg-with-1-dep': '^100.0.0',
        },
      });
      helper.command.install('react@18.3.1 is-odd@1.0.0');
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
      await addDistTag({ package: '@pnpm.e2e/pkg-with-1-dep', version: '100.1.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/dep-of-pkg-with-1-dep', version: '100.1.0', distTag: 'latest' });
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
    });
    it('should save dependencies graph to the model', () => {
      const versionObj = helper.command.catComponent('comp1@latest');
      const depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
      const directDeps = depsGraph.edges.find((edge) => edge.id === '.')?.neighbours;
      expect(directDeps).deep.include({
        name: 'react',
        specifier: '18.3.1',
        id: 'react@18.3.1',
        lifecycle: 'runtime',
        optional: false,
      });
      expect(directDeps).deep.include({
        name: 'is-odd',
        specifier: '1.0.0',
        id: 'is-odd@1.0.0',
        lifecycle: 'dev',
        optional: false,
      });
    });
    describe('sign component and use dependency graph to generate a lockfile', () => {
      let signOutput: string;
      let signRemote;
      before(async () => {
        helper.command.export();
        signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, signRemote.scopePath);
        const { head } = helper.command.catComponent(`${helper.scopes.remote}/comp1`);
        signOutput = helper.command.sign(
          [`${helper.scopes.remote}/comp1@${head}`],
          '--push --log',
          signRemote.scopePath
        );
      });
      it('should sign successfully', () => {
        expect(signOutput).to.include('the following 1 component(s) were signed with build-status "succeed"');
      });
      it('should save dependencies graph to the model', () => {
        const versionObj = helper.command.catComponent('comp1@latest');
        const depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
        const directDeps = depsGraph.edges.find((edge) => edge.id === '.')?.neighbours;
        expect(directDeps).deep.include({
          name: 'react',
          specifier: '18.3.1',
          id: 'react@18.3.1',
          lifecycle: 'runtime',
          optional: false,
        });
        expect(directDeps).deep.include({
          name: 'is-odd',
          specifier: '1.0.0',
          id: 'is-odd@1.0.0',
          lifecycle: 'dev',
          optional: false,
        });
      });
    });
    describe('imported component uses dependency graph to generate a lockfile', () => {
      before(async () => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.import(`${helper.scopes.remote}/comp1@latest`);
      });
      it('should generate a lockfile', () => {
        expect(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8')).to.have.string(
          'restoredFromModel: true'
        );
      });
    });
  });
  describe('single component and sign writes the dependency graph', () => {
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react"); require('@pnpm.e2e/pkg-with-1-dep')`);
      helper.fs.outputFile(
        `comp1/index.spec.js`,
        `const isOdd = require("is-odd"); test('test', () => { expect(1).toEqual(1); })`
      );
      await addDistTag({ package: '@pnpm.e2e/pkg-with-1-dep', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/dep-of-pkg-with-1-dep', version: '100.0.0', distTag: 'latest' });
      helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          '@pnpm.e2e/pkg-with-1-dep': '^100.0.0',
        },
      });
      helper.command.install('react@18.3.1 is-odd@1.0.0');
      fs.unlinkSync(path.join(helper.fixtures.scopes.localPath, 'pnpm-lock.yaml'));
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
      await addDistTag({ package: '@pnpm.e2e/pkg-with-1-dep', version: '100.1.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/dep-of-pkg-with-1-dep', version: '100.1.0', distTag: 'latest' });
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
    });
    it('should not save dependencies graph to the model', () => {
      const versionObj = helper.command.catComponent('comp1@latest');
      expect(versionObj.dependenciesGraphRef).to.be.undefined;
    });
    describe('sign component and use dependency graph to generate a lockfile', () => {
      let signOutput: string;
      let lockfile: LockfileFileV9;
      let signRemote;
      before(async () => {
        helper.command.export();
        signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, signRemote.scopePath);
        const { head } = helper.command.catComponent(`${helper.scopes.remote}/comp1`);
        signOutput = helper.command.sign(
          [`${helper.scopes.remote}/comp1@${head}`],
          '--push --log',
          signRemote.scopePath
        );
      });
      it('should sign successfully', () => {
        expect(signOutput).to.include('the following 1 component(s) were signed with build-status "succeed"');
      });
      it('should generate a lockfile', () => {
        const capsulesDir = signOutput.match(/running installation in root dir (\/[^\s]+)/)?.[1];
        expect(capsulesDir).to.be.a('string');
        lockfile = yaml.load(fs.readFileSync(path.join(stripAnsi(capsulesDir!), 'pnpm-lock.yaml'), 'utf8'));
        expect(lockfile['bit']).to.be.undefined; // eslint-disable-line
      });
    });
    describe('imported component uses dependency graph to generate a lockfile', () => {
      before(async () => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.import(`${helper.scopes.remote}/comp1@latest`);
      });
      it('should generate a lockfile', () => {
        expect(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8')).to.have.string(
          'restoredFromModel: true'
        );
      });
      it('should save dependencies graph to the model', () => {
        const versionObj = helper.command.catComponent('comp1@latest');
        const depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
        expect(depsGraph).to.not.be.undefined;
      });
    });
  });
  describe('two components with different peer dependencies', function () {
    const env1DefaultPeerVersion = '16.0.0';
    const env2DefaultPeerVersion = '17.0.0';
    let randomStr: string;
    before(async () => {
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
        helper.scopeHelper.reInitLocalScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.fs.createFile('foo', 'foo.js', `require("@pnpm.e2e/abc"); require("@ci/${randomStr}.bar");`);
      helper.command.addComponent('foo');
      helper.extensions.addExtensionToVariant('foo', `${helper.scopes.remote}/custom-env/env@0.0.1`, {});
      helper.command.install('--add-missing-deps');
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
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
});
