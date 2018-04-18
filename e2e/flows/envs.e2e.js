import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

// should store the env files in the scope
// should send the env files to the remote scope
// should store the dynamic config in the models
// should support declare env in old format (string)
// should not show component in modified if the compiler defined in old format (string)
// should load the envs from component bit.json if exist
// should load the envs (include files) from models if there is no bit.json
// should load the envs from consumer bit.json for authored component
// eject env should create bit.json if not exists
// eject env twice should not break the bit.json
// eject only compiler or only tester
// eject to custom folder
// add dynamic deps from the compiler to component dev deps
// dynamic config should be written as raw config when ejecting
// change the default dir for envs (in consumer bit.json)
// imported - should not show the component as modified if a file added to @bit-envs folder
// author - should show the component as modified if an env file has been changed
// imported - should show the component as modified if an env file has been changed
// should not show components as modified for consumer bit.json in old format
// should not show components as modified for component with old model format
// should skip the test running if --skip-test flag provided during tag (move to tag.e2e)
// should move envs files during bit move command

describe.skip('envs', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('tests scenarios ', () => {});
});
