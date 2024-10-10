import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('dependencies graph data', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('single component', () => {
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
      helper.fs.outputFile(`comp1/index.spec.js`, `const isOdd = require("is-odd")`);
      helper.command.install('react@18.3.1 is-odd@1.0.0');
      helper.command.snapAllComponents('--skip-tests');
    });
    it('should save dependencies graph to the model', () => {
      const versionObj = helper.command.catComponent('comp1@latest');
      const depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
      expect(depsGraph.importers['.'].dependencies.react).to.eq('18.3.1');
      expect(depsGraph.importers['.'].devDependencies['is-odd']).to.eq('1.0.0');
      expect(depsGraph.directDependencies['react@18.3.1']).to.eq('18.3.1');
      expect(depsGraph.directDependencies['is-odd@1.0.0']).to.eq('1.0.0');
      console.log(JSON.stringify(depsGraph, null, 2));
    });
  });
  describe('two components with different peer dependencies', function () {
    const env1DefaultPeerVersion = '16.0.0';
    const env2DefaultPeerVersion = '17.0.0';
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react") // eslint-disable-line`);
      helper.fs.outputFile(
        `comp2/index.js`,
        `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1"); // eslint-disable-line`
      );
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-react/env1`, {});
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-react/env2`, {});
      helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
      helper.command.install('--add-missing-deps');
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should save dependencies graph to the model', () => {
      const versionObj = helper.command.catComponent('comp1@latest');
      const depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
      expect(depsGraph.importers['.'].dependencies.react).to.eq('16.0.0');
      expect(depsGraph.directDependencies['react@16.0.0']).to.eq('16.0.0');
      console.log(JSON.stringify(depsGraph, null, 2));
    });
    it('should save dependencies graph to the model', () => {
      const versionObj = helper.command.catComponent('comp2@latest');
      const depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
      expect(depsGraph.importers['.'].dependencies.react).to.eq('17.0.0');
      expect(depsGraph.directDependencies['react@17.0.0']).to.eq('17.0.0');
      console.log(JSON.stringify(depsGraph, null, 2));
    });
  });
});
