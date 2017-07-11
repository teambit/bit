// covers also init, create, commit, import and export commands

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const helper = new Helper();

describe.skip('bit commit command', function () {
  this.timeout(0);
  after(() => {
    helper.destroyEnv();
  });
  describe('commit one component', () => {
    before(() => {
    });

    it('should throw error if the bit id not exists', () => {
    });

    it('should persist the model in the scope', () => {
    });

    it('should run the onCommit hook', () => {
    });

    describe('commit imported component', () => {
      it('should index the component', () => {
      });
    });

    describe('commit added component', () => {
      it('should index the component', () => {
      });

      it('Should throw error if there is tracked files dependencies which not commited yet', () => {
      });

      it('should add the correct dependencies to each component', () => {
      });
    });
  });

  describe('commit all components', () => {

    it('Should print there is nothing to commit if there is no changes', () => {
    });

    it('Should throw error if there is untracked files dependencies', () => {
    });

    // We throw this error because we don't know the packege version in this case
    it('should throw error if there is missing package dependency', () => {
    });

    it('should index all components', () => {
    });

    it('should commit the components in the correct order', () => {
    });

    it('should add the correct dependencies to each component', () => {
      // Make sure the use case contain dependenceis from all types - 
      // Packages, files and bits
    });

    it('should persist all models in the scope', () => {
    });

    it('should run the onCommit hook', () => {
    });

    it('', () => {
    });
  });
});
