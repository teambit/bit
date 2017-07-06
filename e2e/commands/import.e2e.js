// covers also init, create, commit, modify commands

import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

const helper = new Helper();

describe('bit import', function () {
  this.timeout(0);

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
    helper.addBitJsonDependencies(bitJsonPath, { [`@${helper.remoteScope}/global/simple`]: '1' }, {'lodash.get': "4.4.2"});
    helper.commitComponent('with-deps');
    helper.exportComponent('with-deps');

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

  beforeEach(() => {
    helper.reInitLocalScope();
    helper.addRemoteScope();
  });

  describe('Import stand alone component (without dependencies)', () => {
    it.skip('Should throw error if there is already component with the same name and namespace and different scope', () => {
    });

    it('Should write the component in bit.json file', () => {
      const output = helper.runCmd(`bit import @${helper.remoteScope}/global/simple`);
      const bitJson = helper.readBitJson();
      expect(output.includes('successfully imported the following Bit components')).to.be.true;
      expect(output.includes('global/simple')).to.be.true;
      const depName = path.join(helper.remoteScope, 'global', 'simple');
      expect(bitJson.dependencies).to.include({[depName] : "1"});
    });

    describe('Component without envs', () => {
      it('Should add the component into bit.map file', () => {
        helper.runCmd(`bit import @${helper.remoteScope}/global/simple`);
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('global/simple');
      });
      describe('Write the component to file system correctly', () => {
        // TODO: Validate all files exists in a folder with the component name
        it('Should write the component to asked path (-p)', () => {
          helper.runCmd(`bit import @${helper.remoteScope}/global/simple -p my-custom-location`);
          const expectedLocation = path.join(helper.localScopePath, 'my-custom-location', 'impl.js');
          expect(fs.existsSync(expectedLocation)).to.be.true;
        });
        it('Should write the component to default path from bit.json', () => {
          //TODO: check few cases with different structure props - namespace, name, version, scope
          helper.runCmd(`bit import @${helper.remoteScope}/global/simple`);
          const expectedLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'impl.js');
          expect(fs.existsSync(expectedLocation)).to.be.true;
        });
        // Prevent cases when I export a component with few files from different directories
        // and get it in another structure during imports
        it.skip('Should write the component to the paths specified in bit.map', () => {
        });
      });
    });

    describe.skip('Component with compiler and tester', () => {
      it('Should not install envs when not requested', () => {
      });
      it('Should install envs when requested (-e)', () => {
      });
      it('Should create bit.json file with envs in the folder', () => {
      });
    });
  });

  describe('Import component with dependencies', () => {
    it('Should add all missing components to bit.map file', () => {
      helper.runCmd(`bit import @${helper.remoteScope}/global/with-deps`);
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple::1`);
    });
    it.skip('Should mark dependencies source in bit.map file', () => {
      // Make sure direct imports are marked as such
      // Make sure nested dependencies are marked as such
    });
    it.skip('Should not add existing components to bit.map file', () => {
    });
    it.skip('Should create bit.json file with all the dependencies in the folder', () => {
    });
    it('Should print warning for missing package dependencies', () => {
      const output = helper.runCmd(`bit import @${helper.remoteScope}/global/with-deps`);
      expect(output.includes('Missing the following package dependencies. Please install and add to package.json')).to.be.true;
      expect(output.includes('lodash.get: 4.4.2')).to.be.true;
    });
    describe('Write the component to file system correctly', () => {
      it('Should create a recursive nested dependency tree', () => {
        helper.runCmd(`bit import @${helper.remoteScope}/global/with-deps`);
        const depDir = path.join(helper.localScopePath, 'components', 'global', 'with-deps',
          'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
        expect(fs.existsSync(depDir)).to.be.true;
      });
      it('Should not write again to file system same dependencies which imported by another component', () => {
        helper.runCmd(`bit import @${helper.remoteScope}/global/with-deps`);
        helper.runCmd(`bit import @${helper.remoteScope}/global/with-deps2`);
        const depDir = path.join(helper.localScopePath, 'components', 'global', 'with-deps',
          'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
        expect(fs.existsSync(depDir)).to.be.true;
        const dep2Dir = path.join(helper.localScopePath, 'components', 'global', 'with-deps2',
          'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
        expect(fs.existsSync(dep2Dir)).to.be.false;
      });
    });
  });

  describe.skip('Import compiler', () => {
    it('Should install package dependencies', () => {
    });
  });

  describe.skip('Import tester', () => {
    it('Should install package dependencies', () => {
    });
  });
});
