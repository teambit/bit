import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import { WRAPPER_DIR } from '../../src/constants';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

const fixturePackageJson = '{ "name": "nice-package" }';

chai.use(require('chai-fs'));

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
      helper.createFile('', 'package.json', fixturePackageJson);
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
    describe('importing the component using isolated environment', () => {
      let isolatePath;
      before(() => {
        isolatePath = helper.isolateComponent('foo/pkg', '-olw');
      });
      it('should create the package.json file in the wrap dir', () => {
        expect(path.join(isolatePath, WRAPPER_DIR, 'package.json')).to.be.a.file();
      });
    });
  });
  describe('a component requires another component with package.json', () => {
    let consumerFiles;
    let bitMap;
    let componentMapBarFoo;
    let componentMapFooPkg;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('', 'package.json', fixturePackageJson);
      helper.addComponentWithOptions('package.json', { i: 'foo/pkg' });
      helper.createFile('', 'foo.js', 'require("./package.json");');
      helper.addComponentWithOptions('foo.js', { i: 'bar/foo' });
      helper.tagAllWithoutMessage();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      consumerFiles = helper.getConsumerFiles('*.{js,json}');
      bitMap = helper.readBitMap();
      componentMapBarFoo = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
      componentMapFooPkg = bitMap[`${helper.remoteScope}/foo/pkg@0.0.1`];
    });
    it('should wrap the nested component (the dependency) with the wrap dir', () => {
      expect(consumerFiles).to.include(
        path.join('components/.dependencies/foo/pkg', helper.remoteScope, '0.0.1', WRAPPER_DIR, 'package.json')
      );
    });
    it('should wrap the component files in a wrapper dir', () => {
      // even though the component (bar/foo) doesn't require the root package.json, it still needs
      // to be wrapped because its dependency does require the root package.json. to be able to
      // generate the links to the dependency, it must be inside a wrapper dir
      expect(consumerFiles).to.include(path.join('components/bar/foo', WRAPPER_DIR, 'foo.js'));
    });
    it('should generate a link to the correct path of its dependency package.json file', () => {
      const linkPath = path.join('components/bar/foo', WRAPPER_DIR, 'package.json');
      expect(path.join(helper.localScopePath, linkPath)).to.be.a.path();
      const linkContent = helper.readFile(linkPath);
      expect(linkContent).to.be.equal(fixturePackageJson);
    });
    it('should save the wrapDir attribute of the dependency', () => {
      expect(componentMapFooPkg).to.have.property('wrapDir');
      expect(componentMapFooPkg.wrapDir).to.equal(WRAPPER_DIR);
    });
    it('should save the wrapDir attribute of the dependent', () => {
      expect(componentMapBarFoo).to.have.property('wrapDir');
      expect(componentMapBarFoo.wrapDir).to.equal(WRAPPER_DIR);
    });
    it('should wrap the files of the dependency', () => {
      expect(componentMapFooPkg.files[0].relativePath).to.equal('bit_wrapper_dir/package.json');
    });
    it('should wrap the files of the dependent', () => {
      expect(componentMapBarFoo.files[0].relativePath).to.equal('bit_wrapper_dir/foo.js');
    });
  });
});
