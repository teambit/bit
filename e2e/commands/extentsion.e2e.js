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
  it.skip('Default plugin should load', () => {});
  it.skip('Extension with exception should not corrupt bit', () => {});
  it.skip('Exception from hook should not affect others which are registers for that hook', () => {});
  it.skip('Should be able to trigger a hook', () => {});
  describe('new command for extension', () => {
    it.skip('Should be shown in --help', () => {});
    it.skip('Should be shown in "bit <command> -h"', () => {});
  });
  describe('extension can register a new hook', () => {
    it.skip('Should be able to trigger the hook they created', () => {});
    it.skip('Should not be able to trigger a hook they didnt create', () => {});
  });
  it.skip('2 different extentions create hook with the same name', () => {});
  it.skip('default hook should run when triggered', () => {});
  describe('running a hook', () => {
    it.skip('Should trigger loader', () => {});
    it.skip('Should write to log', () => {});
    it.skip('Should check that the name of the extension appears in the log', () => {});
    it.skip('Should not run a disabled hook ', () => {});
  });
  describe('when importing extension', () => {
    it.skip('Should be able to import extension with --extention flag', () => {});
    it.skip('if imported more that once should have the latest import in the bit.json', () => {});
    it.skip('Should pass the config', () => {});
    it.skip('Should be able to upload from a local file using relative path', () => {});
    it.skip('Should be able to upload from a local file using absolute path', () => {});
    it.skip('extension should be able to use a dependency', () => {});
    it.skip('extension can be loaded programatically', () => {});
    it.skip('api of an isolated component should work in an extension', () => {});
  });
});
