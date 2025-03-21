import fs from 'fs';
import path from 'path';
import chai, { expect } from 'chai';
import { Extensions } from '@teambit/legacy.constants';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import { DEPS_GRAPH } from '@teambit/harmony.modules.feature-toggle';
import { type BitLockfileFile } from '@teambit/pnpm';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import stripAnsi from 'strip-ansi';
import { addDistTag } from '@pnpm/registry-mock';
import yaml from 'js-yaml';

chai.use(require('chai-fs'));

describe('sign command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('simple case with one scope with --push flag', () => {
    let signOutput: string;
    let localWorkspace: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      localWorkspace = helper.scopeHelper.cloneWorkspace();
      // yes, this is strange, it adds the remote-scope to itself as a remote. we need it because
      // we run "action" command from the remote to itself to clear the cache. (needed because
      // normally bit-sign is running from the fs but a different http service is running as well)
      helper.scopeHelper.addRemoteScope(undefined, helper.scopes.remotePath);
      const ids = [`${helper.scopes.remote}/comp1`, `${helper.scopes.remote}/comp2`];
      // console.log('sign-command', `bit sign ${ids.join(' ')}`);
      signOutput = helper.command.sign(ids, '--push --original-scope', helper.scopes.remotePath);
    });
    it('on the workspace, the build status should be pending', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp1.buildStatus).to.equal('pending');
    });
    it('should sign successfully', () => {
      expect(signOutput).to.include('the following 2 component(s) were signed with build-status "succeed"');
    });
    it('should save updated versions on the remotes', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, helper.scopes.remotePath);
      expect(comp1.buildStatus).to.equal('succeed');
      expect(comp1.modified).to.have.lengthOf(1);
    });
    it('should have extracted the schema correctly', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, helper.scopes.remotePath);
      const builderArtifacts = comp1.extensions.find((e) => e.name === Extensions.builder).data.artifacts;
      const schemaArtifact = builderArtifacts.find(
        (a) => a.task.id === 'teambit.semantics/schema' && a.task.name === 'ExtractSchema'
      );
      expect(schemaArtifact).to.not.be.undefined;
    });
    describe('running bit import on the workspace', () => {
      before(() => {
        helper.command.importAllComponents();
      });
      it('should bring the updated Version from the remote', () => {
        const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
        expect(comp1.buildStatus).to.equal('succeed');
      });
    });
    describe('running bit artifacts', () => {
      let artifactsOutput: string;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localWorkspace);
        artifactsOutput = helper.command.artifacts('comp1');
      });
      it('should import the built Version and shows the built artifacts successfully', () => {
        expect(artifactsOutput).to.include('teambit.compilation/compiler');
        expect(artifactsOutput).to.include('index.js');
      });
    });
  });
  describe('simple case with one scope without --push flag', () => {
    let signOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const ids = [`${helper.scopes.remote}/comp1`, `${helper.scopes.remote}/comp2`];
      // console.log('sign-command', `bit sign ${ids.join(' ')}`);
      signOutput = helper.command.sign(ids, '--original-scope', helper.scopes.remotePath);
    });
    it('on the workspace, the build status should be pending', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp1.buildStatus).to.equal('pending');
    });
    it('should sign successfully', () => {
      expect(signOutput).to.include('the following 2 component(s) were signed with build-status "succeed"');
    });
  });
  describe('sign a built component', () => {
    let signRemote;
    let firstSnap;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.snapComponent('comp1', undefined, '--build');
      firstSnap = helper.command.getHead('comp1');
      helper.command.export();
      signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
    });
    it('should sign the last successfully', () => {
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, signRemote.scopePath);
      const signOutput = helper.command.sign([`${helper.scopes.remote}/comp1@${firstSnap}`], '', signRemote.scopePath);
      expect(signOutput).to.include('the following component(s) were already signed successfully');
      expect(signOutput).to.include('no more components left to sign');
    });
  });
  describe('without specifying the ids', () => {
    let signOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // console.log('sign-command', `bit sign ${ids.join(' ')}`);
      signOutput = helper.command.sign([], '--original-scope', helper.scopes.remotePath);
    });
    it('should sign successfully', () => {
      expect(signOutput).to.include('the following 2 component(s) were signed with build-status "succeed"');
    });
  });
  describe('failure case', () => {
    let signOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('bar/index.js');
      helper.fs.outputFile('bar/foo.spec.js'); // it will fail as it doesn't have any test
      helper.command.addComponent('bar');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // yes, this is strange, it adds the remote-scope to itself as a remote. we need it because
      // we run "action" command from the remote to itself to clear the cache. (needed because
      // normally bit-sign is running from the fs but a different http service is running as well)
      helper.scopeHelper.addRemoteScope(undefined, helper.scopes.remotePath);
      const ids = [`${helper.scopes.remote}/bar`];
      // console.log('sign-command', `bit sign ${ids.join(' ')}`);
      signOutput = helper.command.sign(ids, '--always-succeed --push --original-scope', helper.scopes.remotePath);
    });
    it('on the workspace, the build status should be pending', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/bar@latest`);
      expect(comp1.buildStatus).to.equal('pending');
    });
    it('should sign with failure', () => {
      expect(signOutput).to.include('the following 1 component(s) were signed with build-status "failed"');
    });
    it('should save updated versions on the remotes', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/bar@latest`, helper.scopes.remotePath);
      expect(comp1.buildStatus).to.equal('failed');
    });
    describe('running bit import on the workspace', () => {
      before(() => {
        helper.command.import('--all-history');
      });
      it('should bring the updated Version from the remote', () => {
        const comp1 = helper.command.catComponent(`${helper.scopes.remote}/bar@latest`);
        expect(comp1.buildStatus).to.equal('failed');
      });
    });
  });
  describe('sign components from lanes', () => {
    let signOutput: string;
    let secondScopeName: string;
    let snapHash: string;
    let firstSnapHash: string;
    let signRemote;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      const secondRemote = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath);
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath, helper.scopes.remotePath);
      secondScopeName = secondRemote.scopeName;

      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.setScope(secondScopeName, 'comp1');
      helper.command.snapAllComponentsWithoutBuild();
      firstSnapHash = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      snapHash = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
    });
    it('should sign the last successfully', () => {
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, signRemote.scopePath);
      signOutput = helper.command.sign(
        [`${secondScopeName}/comp1@${snapHash}`],
        `--lane ${helper.scopes.remote}/dev --save-locally`,
        signRemote.scopePath
      );
      expect(signOutput).to.include('the following 1 component(s) were signed with build-status "succeed"');
      expect(signOutput).to.not.include('tag pipe');
      expect(signOutput).to.include('snap pipe');

      const obj = helper.command.catObject(snapHash, true, signRemote.scopePath);
      const pkgAspectData = helper.command.getAspectsData(obj, Extensions.pkg);
      const version = pkgAspectData.data.pkgJson.version;
      expect(version).to.equal(`0.0.0-${snapHash}`);
    });
    it('should be able to sign previous snaps on this lane successfully', () => {
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, signRemote.scopePath);
      signOutput = helper.command.sign(
        [`${secondScopeName}/comp1@${firstSnapHash}`],
        `--lane ${helper.scopes.remote}/dev --save-locally`,
        signRemote.scopePath
      );
      expect(signOutput).to.include('the following 1 component(s) were signed with build-status "succeed"');

      const obj = helper.command.catObject(firstSnapHash, true, signRemote.scopePath);
      const pkgAspectData = helper.command.getAspectsData(obj, Extensions.pkg);
      const version = pkgAspectData.data.pkgJson.version;
      expect(version).to.equal(`0.0.0-${firstSnapHash}`);
    });
    it('should sign the last successfully and export', () => {
      signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, signRemote.scopePath);
      signOutput = helper.command.sign(
        [`${secondScopeName}/comp1@${snapHash}`],
        `--lane ${helper.scopes.remote}/dev --push`,
        signRemote.scopePath
      );
      expect(signOutput).to.include('the following 1 component(s) were signed with build-status "succeed"');
    });
  });
  describe('circular dependencies between two scopes', () => {
    let signOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const secondRemote = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath);
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, secondRemote.scopePath);
      helper.fs.outputFile('comp1/index.js', `require('@${secondRemote.scopeName}/comp2');`);
      helper.fs.outputFile('comp2/index.js', `require('@${helper.scopes.remote}/comp1');`);
      helper.command.addComponent('comp1');
      helper.workspaceJsonc.addToVariant('comp2', 'defaultScope', secondRemote.scopeName);
      helper.command.addComponent('comp2');
      helper.command.linkAndCompile();
      helper.command.tagAllWithoutBuild('--ignore-issues="CircularDependencies"');
      helper.command.export();

      const signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath, signRemote.scopePath);
      signOutput = helper.command.sign(
        [`${helper.scopes.remote}/comp1`, `${secondRemote.scopeName}/comp2`],
        '--push',
        signRemote.scopePath
      );
    });
    it('on the workspace, the build status should be pending', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp1.buildStatus).to.equal('pending');
    });
    it('should sign successfully', () => {
      expect(signOutput).to.include('the following 2 component(s) were signed with build-status "succeed"');
    });
    it('should save updated versions on the remotes', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, helper.scopes.remotePath);
      expect(comp1.buildStatus).to.equal('succeed');
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('dependencies graph data', function () {
    this.timeout(0);
    let npmCiRegistry: NpmCiRegistry;
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
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        npmCiRegistry.configureCiInPackageJsonHarmony();
        await npmCiRegistry.init();
        helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
        helper.fixtures.populateComponents(1);
        helper.fs.outputFile(`comp1/index.js`, `const isEven = require("is-even"); require('@pnpm.e2e/pkg-with-1-dep')`);
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
        helper.command.install('is-even@1.0.0 is-odd@1.0.0');
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
          name: 'is-even',
          specifier: '1.0.0',
          id: 'is-even@1.0.0',
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
            name: 'is-even',
            specifier: '1.0.0',
            id: 'is-even@1.0.0',
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
          helper.scopeHelper.reInitWorkspace();
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
        helper.scopeHelper.setWorkspaceWithRemoteScope();
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
        let lockfile: BitLockfileFile;
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
          expect(lockfile.bit).to.eql({
            depsRequiringBuild: [],
          });
        });
      });
      describe('imported component uses dependency graph to generate a lockfile', () => {
        before(async () => {
          helper.scopeHelper.reInitWorkspace();
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
    describe('two components exported then one imported', function () {
      let randomStr: string;
      before(async () => {
        randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
        const name = `@ci/${randomStr}.{name}`;
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
        await npmCiRegistry.init();
        helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());

        helper.fixtures.populateComponents(2);
        helper.command.install('--add-missing-deps');
        helper.command.tagAllWithoutBuild('--skip-tests');
        helper.command.export();
        const signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, signRemote.scopePath);
        helper.command.sign(
          [`${helper.scopes.remote}/comp2@0.0.1`],
          '',
          signRemote.scopePath
        );
        helper.command.export();
        helper.command.sign(
          [`${helper.scopes.remote}/comp1@0.0.1`],
          '',
          signRemote.scopePath
        );
        helper.command.export();
      });
      after(() => {
        npmCiRegistry.destroy();
        helper.command.delConfig('registry');
        helper.scopeHelper.destroy();
      });
      it('should generate a lockfile', () => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.import(`${helper.scopes.remote}/comp1@latest`);
        expect(helper.fs.readFile('pnpm-lock.yaml')).to.have.string(
          'restoredFromModel: true'
        );
      });
    });
  });
});
