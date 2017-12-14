import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit extension system', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  beforeEach(() => {
    helper.reInitLocalScope();
  });

  it.skip('Exception from hook should not affect others which are registers for that hook', () => {});
  it.skip('Should be able to trigger a hook', () => {});
  describe('new command for extension', () => {
    it.skip('Should be shown in --help', () => {});
    it.skip('Should be able to run "bit <command> -h"', () => {});
    it.skip('Should trigger loader', () => {});
  });
  describe('extension can register a new hook', () => {
    it.skip('Should be able to trigger the hook they created', () => {});
    it.skip('Should not be able to trigger a hook they didnt create', () => {});
  });
  it.skip('2 different extentions create hook with the same name', () => {});
  describe('extension logger', () => {
    it.skip('Should write to log', () => {});
    it.skip('Should check that the name of the extension appears in the log', () => {});
  });
  describe('default hooks', () => {
    it.skip('default hook should run when triggered', () => {});
  });
  describe('when importing another version of the same extension', () => {
    it.skip('Should be able to import extension with --extention flag', () => {});
    it.skip('Should have the latest import in the bit.json', () => {});
    it.skip('Should copy the config / options in bit.json to the new version', () => {});
    it.skip('extension should be able to use a dependency', () => {});
  });
  describe('loading extension', () => {
    it.skip('Should be able to load from a local file using relative path', () => {});
    it.skip('Should be able to load from a local file using absolute path', () => {});
    it.skip('Should pass the config to extensions init function', () => {});
    it.skip('Default extension should load', () => {});
    it.skip('Extension with exception during init should not corrupt bit', () => {});
    it.skip('Should not run a disabled hook ', () => {});
  });
  describe('load extension programmatically', () => {
    it.skip('extension can be loaded programatically', () => {});
  });
  describe('isolated component', () => {
    it.skip('api of an isolated component should work in an extension', () => {});
  });
});
