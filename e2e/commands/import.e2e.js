// covers also init, create, commit, modify commands

import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

describe('bit import', function () {
  this.timeout(0);
  const helper = new Helper();
  before(() => {
    helper.reInitLocalScope();
    helper.reInitRemoteScope();
    helper.addRemoteScope();

    // Create remote scope with all needed components

    // export a new simple component
    helper.runCmd('bit create simple');
    helper.commitComponent('simple');
    helper.exportComponent('simple');

    // export a new component with dependencies
    helper.runCmd('bit create with-deps -j');
    const bitJsonPath = path.join(helper.localScopePath, '/components/global/with-deps/bit.json'); // TODO: Change to use the automatic deps resolver
    // add "foo" as a bit.json dependency and lodash.get as a package dependency
    helper.addBitJsonDependencies(bitJsonPath, { [`@${helper.remoteScope}/global/simple`]: '1' }, { 'lodash.get': '4.4.2' });
    helper.commitComponent('with-deps');
    helper.exportComponent('with-deps');

    helper.createComponent('src', 'imprel.js');
    helper.createComponent('src', 'imprel.spec.js');
    helper.createFile('src/utils', 'myUtil.js');
    helper.runCmd(`bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/imprel`);
    helper.commitComponent('imprel/imprel');
    helper.exportComponent('imprel/imprel');

    // export another component with dependencies
    helper.runCmd('bit create with-deps2 -j');
    const deps2JsonPath = path.join(helper.localScopePath, '/components/global/with-deps2/bit.json'); // TODO: Change to use the automatic deps resolver
    helper.addBitJsonDependencies(deps2JsonPath, { [`@${helper.remoteScope}/global/simple`]: '1' });
    helper.commitComponent('with-deps2');
    helper.exportComponent('with-deps2');
  });

  after(() => {
    helper.destroyEnv();
  });

  describe('stand alone component (without dependencies)', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
      const output = helper.importComponent('global/simple');
      expect(output.includes('successfully imported the following Bit components')).to.be.true;
      expect(output.includes('global/simple')).to.be.true;
    });
    it.skip('should throw an error if there is already component with the same name and namespace and different scope', () => {
    });
    it('should add the component to bit.json file', () => {
      const bitJson = helper.readBitJson();
      const depName = path.join(helper.remoteScope, 'global', 'simple');
      expect(bitJson.dependencies).to.include({ [depName]: '1' });
    });
    it('should add the component into bit.map file with the full id', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple::1`);
    });
    // TODO: Validate all files exists in a folder with the component name
    it('should write the component to default path from bit.json', () => {
      // TODO: check few cases with different structure props - namespace, name, version, scope
      const expectedLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'impl.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
    it('should write the internal files according to their relative paths', () => {
      const output = helper.importComponent('imprel/imprel');
      expect(output.includes('successfully imported the following Bit components')).to.be.true;
      expect(output.includes('imprel/imprel')).to.be.true;
      const expectedLocationImprel = path.join(helper.localScopePath, 'components', 'imprel', 'imprel', 'imprel.js');
      const expectedLocationImprelSpec = path.join(helper.localScopePath, 'components', 'imprel', 'imprel', 'imprel.spec.js');
      const expectedLocationMyUtil = path.join(helper.localScopePath, 'components', 'imprel', 'imprel', 'utils', 'myUtil.js');
      expect(fs.existsSync(expectedLocationImprel)).to.be.true;
      expect(fs.existsSync(expectedLocationImprelSpec)).to.be.true;
      expect(fs.existsSync(expectedLocationMyUtil)).to.be.true;
    });

    describe('with an existing component in bit.map', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.commitComponentBarFoo();
        helper.exportComponent('bar/foo');
        const bitMap = helper.readBitMap();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        bitMap['bar/foo'].files['foo.js'] = 'utils/foo.js';
        helper.writeBitMap(bitMap);
        helper.importComponent('bar/foo');
      });

      // Prevent cases when I export a component with few files from different directories
      // and get it in another structure during imports
      it('should write the component to the paths specified in bit.map', () => {
        const expectedLocation = path.join(helper.localScopePath, 'utils', 'foo.js');
        expect(fs.existsSync(expectedLocation)).to.be.true;
      });
    });

    describe('with a specific path, using -p flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.runCmd(`bit import @${helper.remoteScope}/global/simple -p my-custom-location`);
      });
      it('should write the component to the specified path', () => {
        const expectedLocation = path.join(helper.localScopePath, 'my-custom-location', 'impl.js');
        expect(fs.existsSync(expectedLocation)).to.be.true;
      });

      it('should write the internal files according to their relative paths', () => {

      });
    });

    describe.skip('with compiler and tester', () => {
      it('should not install envs when not requested', () => {
      });
      it('should install envs when requested (-e)', () => {
      });
      it('should create bit.json file with envs in the folder', () => {
      });
    });
  });

  describe('component with dependencies', () => {
    let output;
    let bitMap;
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
      output = helper.importComponent('global/with-deps');
      bitMap = helper.readBitMap();
    });
    it('should add all missing components to bit.map file', () => {
      expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple::1`);
    });
    it('should mark direct dependencies as "IMPORTED" in bit.map file', () => {
      expect(bitMap[`${helper.remoteScope}/global/with-deps::1`].origin).to.equal('IMPORTED');
    });
    it('should mark indirect dependencies as "NESTED" in bit.map file', () => {
      expect(bitMap[`${helper.remoteScope}/global/simple::1`].origin).to.equal('NESTED');
    });
    it.skip('should not add existing components to bit.map file', () => {
    });
    it.skip('should create bit.json file with all the dependencies in the folder', () => {
    });
    it('should print warning for missing package dependencies', () => {
      expect(output.includes('Missing the following package dependencies. Please install and add to package.json')).to.be.true;
      expect(output.includes('lodash.get: 4.4.2')).to.be.true;
    });
    it('should write the dependency nested to the parent component', () => {
      const depDir = path.join(helper.localScopePath, 'components', 'global', 'with-deps',
        'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
      expect(fs.existsSync(depDir)).to.be.true;
    });

    it('should write the dependencies according to their relative paths', () => {

      });
  });

  describe('multiple components with the same dependency', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('global/with-deps');
      helper.importComponent('global/with-deps2');
    });
    it('should not write again to the file system the same dependency that imported by another component', () => {
      const depDir = path.join(helper.localScopePath, 'components', 'global', 'with-deps',
        'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
      expect(fs.existsSync(depDir)).to.be.true;
      const dep2Dir = path.join(helper.localScopePath, 'components', 'global', 'with-deps2',
        'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
      expect(fs.existsSync(dep2Dir)).to.be.false;
    });
  });

  describe.skip('Import compiler', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    it('should install package dependencies', () => {
    });
  });

  describe.skip('Import tester', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    it('should install package dependencies', () => {
    });
  });
});
