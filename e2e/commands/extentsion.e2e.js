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

  it.skip('', () => {});
  it.skip('', () => {});
  describe('', () => {});
});
