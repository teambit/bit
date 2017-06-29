// covers also init, create, commit, modify commands

import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

describe('bit import', function () {
  this.timeout(0);
  let helper;
  before(() => {
    helper = new Helper();
    //TODO: Create remote scope with all needed components
  });
  
  describe('Import without component id', () => {
    it('should import all components defined in bit.json', () => {
    });
  });

  describe('Import stand alone component (without dependencies)', () => {
    it('Should throw error if there is already component with the same name and namespace and different scope', () => {
    });

    it('Should write the component in bit.json file', () => {
    });
    
    describe('Component without envs', () => {
      it('Should write the component in bit.map file', () => {
      });
      dsecribe('Write the component to file system correctly', () => {
        // TODO: Validate all files exists in a folder with the component name
        it('Should write the component to asked path (-p)', () => {
        });
        it('Should write the component to default path from bit.json', () => {
          //TODO: check few cases with different structure props - namespace, name, version, scope
        });
        // Prevent cases when I export a component with few files from different directories
        // and get it in another structure during imports
        it('Should write the component to the paths specified in bit.map', () => {
        });
      });
    });
    
    describe('Component with compiler and tester', () => {
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
    });
    it('Should not add existing components to bit.map file', () => {
    });
    it('Should create bit.json file with all the dependencies in the folder', () => {
    });
    dsecribe('Write the component to file system correctly', () => {
      it('Should create a recursive nested dependency tree', () => {
      });
      it('Should not write again to file system same dependencies which imported by another component', () => {
      });
    });
  });

  describe('Import compiler', () => {
    it('Should install package dependencies', () => {
    });
  });

  describe('Import tester', () => {
    it('Should install package dependencies', () => {
    });
  });
});
