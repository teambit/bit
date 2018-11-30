import { expect } from 'chai';
import Compiler from './compiler';

describe('compiler', () => {
  describe('addCommandHook', () => {
    let command;
    before(() => {
      const compiler = new Compiler();
      command = compiler.addCommandHook();
    });
    it('should return an object', () => {
      expect(command).to.be.an('object');
    });
    it('should have properties: name, opts, action and report', () => {
      const keys = Object.keys(command);
      expect(keys).to.include('name');
      expect(keys).to.include('opts');
      expect(keys).to.include('action');
      expect(keys).to.include('report');
    });
  });
});
