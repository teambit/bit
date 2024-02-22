import path from 'path';
import { expect } from 'chai';
import fs from 'fs-extra';
import Helper from '../../src/e2e-helper/e2e-helper';

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
      helper.scopeHelper.reInitLocalScope();
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
  });
});
