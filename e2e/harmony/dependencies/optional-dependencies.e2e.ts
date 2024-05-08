import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../../../src/e2e-helper/e2e-helper';

const ENV_POLICY = {
  peers: [
    {
      name: 'react',
      version: '^17.0.0',
      supportedRange: '^17.0.0 || ^18.0.0',
      optional: true,
    },
  ],
  dev: [],
  runtime: [
    {
      name: 'is-odd',
      version: '3.0.1',
      optional: true,
    },
  ],
};

describe('optional dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  let envId;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.workspaceJsonc.disablePreview();
    envId = `${helper.scopes.remote}/react-based-env`;
    helper.command.create('react', 'button', '-p button --env teambit.react/react');
    helper.fs.prependFile('button/button.tsx', '// @ts-ignore\nimport isOdd from "is-odd";\n');
    helper.fs.appendFile('button/button.tsx', 'isOdd(1);');
    helper.env.setCustomNewEnv(undefined, undefined, { policy: ENV_POLICY });
    helper.command.setEnv('button', envId);
    helper.command.install('@testing-library/react@12');
    helper.command.install('--add-missing-deps');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('affect component', () => {
    let depResolverAspectEntry;
    before(() => {
      depResolverAspectEntry = helper.command.showAspectConfig('button', 'teambit.dependencies/dependency-resolver');
    });
    it('should add optional dependency with optional=true to the model', () => {
      const optionalDependencyEntry = depResolverAspectEntry.data.dependencies.find((dep) => dep.id === 'is-odd');
      expect(optionalDependencyEntry.optional).to.eq(true);
    });
    it('should add optional peer dependency with optional=true to the model', () => {
      const optionalPeerDependencyEntry = depResolverAspectEntry.data.dependencies.find((dep) => dep.id === 'react');
      expect(optionalPeerDependencyEntry.optional).to.eq(true);
    });
    it('should add optionalDependencies and peerDependenciesMeta to package.json', () => {
      const pkgJson = fs.readJsonSync(
        path.join(helper.fixtures.scopes.localPath, `node_modules/@${helper.scopes.remote}/button/package.json`)
      );
      expect(pkgJson.optionalDependencies).to.eql({
        'is-odd': '3.0.1',
      });
      expect(pkgJson.peerDependenciesMeta).to.eql({
        react: {
          optional: true,
        },
      });
    });
    it('should mark optional dependencies in the show command', () => {
      const showOutput = helper.command.showComponent('button');
      expect(showOutput).to.contain('is-odd@3.0.1- (package)(optional)');
      expect(showOutput).to.contain('react@^17.0.0 || ^18.0.0- (package)(optional)');
    });
  });
  describe('affect capsule', () => {
    let workspaceCapsulesRootDir: string;
    let buttonPkgJson;
    before(() => {
      helper.command.build('--tasks CoreExporter');
      workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      buttonPkgJson = fs.readJsonSync(
        path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_button/package.json`)
      );
    });
    it('should add optionalDependencies to package.json', () => {
      expect(buttonPkgJson.optionalDependencies).to.eql({
        'is-odd': '3.0.1',
      });
    });
    it('should add peerDependenciesMeta to package.json', () => {
      expect(buttonPkgJson.peerDependenciesMeta).to.eql({
        react: {
          optional: true,
        },
      });
    });
  });
  describe('deps set --optional', () => {
    let showOutput;
    before(() => {
      helper.command.dependenciesSet('button', 'is-even@1.0.0', '--optional');
      showOutput = helper.command.showComponent('button');
    });
    it('should add new dependency to optional dependencies', () => {
      expect(showOutput).to.contain('is-even@1.0.0- (package)(optional)');
    });
    it('should keep existing optional dependency in optional dependencies', () => {
      expect(showOutput).to.contain('is-odd@3.0.1-- (package)(optional)');
    });
    describe('deps set --optional after snap', () => {
      before(() => {
        helper.command.snapAllComponentsWithoutBuild('-m wip');
        helper.command.dependenciesSet('button', 'is-positive@1.0.0', '--optional');
        showOutput = helper.command.showComponent('button');
      });
      it('should keep existing optional dependency in optional dependencies', () => {
        expect(showOutput).to.contain('is-odd@3.0.1------ (package)(optional)');
        expect(showOutput).to.contain('is-even@1.0.0----- (package)(optional)');
      });
      it('should add new dependency to optional dependencies', () => {
        expect(showOutput).to.contain('is-positive@1.0.0- (package)(optional)');
      });
    });
  });
});
