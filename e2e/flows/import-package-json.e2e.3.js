import path from 'path';
import { expect } from 'chai';
import Helper from '../e2e-helper';
import { WRAPPER_DIR } from '../../src/constants';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

describe('component with package.json as a file of the component', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('a component with package.json', () => {
    let consumerFiles;
    let bitMap;
    let componentMap;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('', 'package.json', '{ "name": "nice-package" }');
      const addOutput = helper.addComponentWithOptions('package.json', { i: 'foo/pkg' });
      expect(addOutput).to.have.string('added package.json');
      helper.tagAllWithoutMessage();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('foo/pkg');
      consumerFiles = helper.getConsumerFiles('*.{js,json}');
      bitMap = helper.readBitMap();
      componentMap = bitMap[`${helper.remoteScope}/foo/pkg@0.0.1`];
    });
    it('should wrap the component files in a wrapper dir', () => {
      expect(consumerFiles).to.include(path.join('components/foo/pkg', WRAPPER_DIR, 'package.json'));
    });
    it('should keep Bit generated files outside of that wrapper dir', () => {
      expect(consumerFiles).to.include(path.normalize('components/foo/pkg/package.json'));
    });
    it('rootDir of the componentMap should not include the wrapper dir', () => {
      expect(componentMap.rootDir).to.equal('components/foo/pkg');
    });
    it('file paths on the componentMap should include the wrapper dir', () => {
      expect(componentMap.files[0].relativePath).to.equal('bit_wrapper_dir/package.json');
      expect(componentMap.mainFile).to.equal('bit_wrapper_dir/package.json');
    });
    it('should add wrapDir attribute to the componentMap', () => {
      expect(componentMap).to.have.property('wrapDir');
      expect(componentMap.wrapDir).to.equal(WRAPPER_DIR);
    });
    it('bit status should not show the component as modified', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
    });
    describe('adding files in the rootDir outside the wrapDir', () => {
      before(() => {
        helper.createFile('components/foo/pkg', 'bar.js');
      });
      it('should not add them to the component', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
      });
    });
  });
});
