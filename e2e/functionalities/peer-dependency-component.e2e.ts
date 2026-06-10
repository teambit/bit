import path from 'path';
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import chaiString from 'chai-string';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(chaiString);

describe('set-peer', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('a component is a peer dependency', () => {
    let workspaceCapsulesRootDir: string;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
      helper.command.setPeer('comp2', '0');
      helper.command.install();
      helper.command.build();
      workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
    });
    it('should save the peer dependency in the model', () => {
      const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
      expect(output.peerDependencies[0]).to.deep.equal({
        id: `${helper.scopes.remote}/comp2`,
        relativePaths: [],
        packageName: `@${helper.scopes.remote}/comp2`,
        versionRange: '0',
      });
      const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
      const peerDep = depResolver.data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.version).to.eq('latest');
      expect(peerDep.versionRange).to.eq('0');
    });
    it('adds peer dependency to the generated package.json', () => {
      const pkgJson = fs.readJsonSync(
        path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1/package.json`)
      );
      expect(pkgJson.peerDependencies).to.deep.equal({
        [`@${helper.scopes.remote}/comp2`]: '0',
      });
    });
    describe('peer dependency is not broken after snap', () => {
      before(() => {
        helper.command.snapAllComponents();
        helper.command.build();
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      it('should save the peer dependency in the model', () => {
        const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
        const peerDepData = output.peerDependencies[0];
        expect(peerDepData.id).to.startWith(`${helper.scopes.remote}/comp2`);
        expect(peerDepData.packageName).to.startWith(`@${helper.scopes.remote}/comp2`);
        expect(peerDepData.versionRange).to.startWith('0');
        const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        const peerDep = depResolver.data.dependencies[0];
        expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.versionRange).to.eq('0');
      });
      it('should save the peer dependency in the scope data', () => {
        const comp = helper.command.catComponent(`comp1@latest`);
        const depResolver = comp.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        const peerDep = depResolver.data.dependencies[0];
        expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.versionRange).to.eq('0');
      });
      it('should save the always peer fields in the scope data', () => {
        const comp = helper.command.catComponent(`comp2@latest`);
        const depResolver = comp.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        expect(depResolver.config.peer).to.eq(true);
        expect(depResolver.config.defaultPeerRange).to.eq('0');
      });
      it('adds peer dependency to the generated package.json', () => {
        const { head } = helper.command.catComponent('comp1');
        const pkgJson = fs.readJsonSync(
          path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1@${head}/package.json`)
        );
        expect(pkgJson.peerDependencies).to.deep.equal({
          [`@${helper.scopes.remote}/comp2`]: '0',
        });
      });
      describe('always peer config fields are preserved when setting new dependencies', () => {
        let bitMap: any;
        before(() => {
          helper.command.dependenciesSet('comp2', 'is-odd@1.0.0');
          bitMap = helper.bitMap.read();
        });
        it('should readd always peer config fields to bitmap', () => {
          expect(bitMap.comp2.config['teambit.dependencies/dependency-resolver'].peer).to.eq(true);
          expect(bitMap.comp2.config['teambit.dependencies/dependency-resolver'].defaultPeerRange).to.eq('0');
        });
      });
    });
    describe('unset-peer', () => {
      before(() => {
        helper.command.unsetPeer('comp2');
        helper.command.snapAllComponents();
        helper.command.build();
      });
      it('should remove the always peer fields from the scope data', () => {
        const comp = helper.command.catComponent(`comp2@latest`);
        const depResolver = comp.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        expect(depResolver.config.peer).to.eq(undefined);
        expect(depResolver.config.defaultPeerRange).to.eq(undefined);
      });
    });
  });
});

describe('set-peer using just the version range prefix', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('a component is a peer dependency', () => {
    let workspaceCapsulesRootDir: string;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
      helper.command.setPeer('comp2', '^');
      helper.command.install();
      helper.command.build();
      workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
    });
    it('should save the peer dependency in the model', () => {
      const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
      expect(output.peerDependencies[0]).to.deep.equal({
        id: `${helper.scopes.remote}/comp2`,
        relativePaths: [],
        packageName: `@${helper.scopes.remote}/comp2`,
        versionRange: '^0.0.1-new',
      });
      const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
      const peerDep = depResolver.data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.version).to.eq('latest');
      expect(peerDep.versionRange).to.eq('^0.0.1-new');
    });
    it('adds peer dependency to the generated package.json', () => {
      const pkgJson = fs.readJsonSync(
        path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1/package.json`)
      );
      expect(pkgJson.peerDependencies).to.deep.equal({
        [`@${helper.scopes.remote}/comp2`]: '^0.0.1-new',
      });
    });
    describe('peer dependency is not broken after snap', () => {
      before(() => {
        helper.command.snapAllComponents();
        helper.command.build();
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      it('should save the peer dependency in the model', () => {
        const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
        const peerDepData = output.peerDependencies[0];
        expect(peerDepData.id).to.startWith(`${helper.scopes.remote}/comp2`);
        expect(peerDepData.packageName).to.startWith(`@${helper.scopes.remote}/comp2`);
        expect(peerDepData.versionRange).to.startWith('^0.0.0-');
        const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        const peerDep = depResolver.data.dependencies[0];
        expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.versionRange).to.startWith('^0.0.0-');
      });
      it('should save the peer dependency in the scope data', () => {
        const comp = helper.command.catComponent(`comp1@latest`);
        const depResolver = comp.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        const peerDep = depResolver.data.dependencies[0];
        expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.versionRange).to.eq('^0.0.1-new');
      });
      it('should save the always peer fields in the scope data', () => {
        const comp = helper.command.catComponent(`comp2@latest`);
        const depResolver = comp.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
        expect(depResolver.config.peer).to.eq(true);
        expect(depResolver.config.defaultPeerRange).to.eq('^');
      });
      it('adds peer dependency to the generated package.json', () => {
        const { head } = helper.command.catComponent('comp1');
        const pkgJson = fs.readJsonSync(
          path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1@${head}/package.json`)
        );
        expect(pkgJson.peerDependencies).to.deep.equal({
          [`@${helper.scopes.remote}/comp2`]: '^0.0.1-new',
        });
      });
      describe('always peer config fields are preserved when setting new dependencies', () => {
        let bitMap: any;
        before(() => {
          helper.command.dependenciesSet('comp2', 'is-odd@1.0.0');
          bitMap = helper.bitMap.read();
        });
        it('should readd always peer config fields to bitmap', () => {
          expect(bitMap.comp2.config['teambit.dependencies/dependency-resolver'].peer).to.eq(true);
          expect(bitMap.comp2.config['teambit.dependencies/dependency-resolver'].defaultPeerRange).to.eq('^');
        });
      });
    });
  });
});

describe('set-peer for existing component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('a component is a peer dependency', () => {
    let workspaceCapsulesRootDir: string;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
      helper.command.install();
      helper.command.snapAllComponents();
      helper.command.setPeer('comp2', '0');
      helper.command.install();
      helper.command.build();
      workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
    });
    it('should save the peer dependency in the model', () => {
      const { head } = helper.command.catComponent('comp2');
      const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
      expect(output.peerDependencies[0]).to.deep.equal({
        id: `${helper.scopes.remote}/comp2@${head}`,
        relativePaths: [],
        packageName: `@${helper.scopes.remote}/comp2`,
        versionRange: '0',
      });
      const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
      const peerDep = depResolver.data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${helper.scopes.remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.version).to.eq(head);
      expect(peerDep.versionRange).to.eq('0');
    });
    it('adds peer dependency to the generated package.json', () => {
      const { head } = helper.command.catComponent('comp1');
      const pkgJson = fs.readJsonSync(
        path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1@${head}/package.json`)
      );
      expect(pkgJson.peerDependencies).to.deep.equal({
        [`@${helper.scopes.remote}/comp2`]: '0',
      });
    });
  });
});

describe('unset-peer for existing component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('a component peer status is removed after snap', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
      helper.command.setPeer('comp2', '0');
      helper.command.install();
      helper.command.snapAllComponents(); // caches comp2 as peer dep of comp1
      helper.command.unsetPeer('comp2');
      helper.command.install();
    });
    it('should not have comp2 as a peer dependency in the model', () => {
      const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
      expect(output.peerDependencies).to.deep.equal([]);
    });
    it('should have comp2 as a runtime dependency', () => {
      const output = helper.command.showComponentParsed(`${helper.scopes.remote}/comp1`);
      const depResolver = output.extensions.find(({ name }) => name === 'teambit.dependencies/dependency-resolver');
      const dep = depResolver.data.dependencies.find(
        (d: { packageName: string }) => d.packageName === `@${helper.scopes.remote}/comp2`
      );
      expect(dep).to.not.be.undefined;
      expect(dep.lifecycle).to.eq('runtime');
    });
  });
});
