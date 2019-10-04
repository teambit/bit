import { expect } from 'chai';
import mockery from 'mockery';
import sinon from 'sinon';
import npmClient from '../npm-client';

/**
 * Skipped the npm client tests because we changed the implementation of the npm install to stream (child process spawn)
 * we should fix this to work with spawn
 */
describe.skip('npmClient.install()', () => {
  const execSpy = sinon.spy();
  const childProcessMock = {
    exec: execSpy
  };

  const fsMock = {
    ensureDirSync: () => {
      return null;
    }
  };

  before(() => {
    mockery.enable({
      warnOnReplace: false,
      warnOnUnregistered: false
    });

    mockery.registerMock('child_process', childProcessMock);
    mockery.registerMock('fs-extra', fsMock);
  });

  after(() => {
    mockery.disable();
  });

  beforeEach(() => {
    execSpy.reset();
  });

  it('should pass the cwd argument to the option of the exec function', () => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    npmClient.install(['mock-module'], { cwd: '/path/to/dir' });
    expect(execSpy.getCall(0).args[1].cwd).to.eql('/path/to/dir');
  });

  it('should except an object of dependencies (from package.json and install the dependencies)', () => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    npmClient.install({ 'mock-module': '^1.1.2', 'another-module': '3.3.2' });
    expect(execSpy.getCall(0).args[0]).to.eql('npm install mock-module@^1.1.2 another-module@3.3.2');
  });

  it('if no cwd was passed it should be process.cwd()', () => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    npmClient.install(['mock-module']);
    expect(execSpy.getCall(0).args[1].cwd).to.eql(process.cwd());
  });

  it('should work if no arguments supplied', () => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    npmClient.install();
    expect(execSpy.getCall(0).args[0]).to.eql('npm install');
  });

  it('should work if the first argument is a string', () => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    npmClient.install('mock-module');
    expect(execSpy.getCall(0).args[0]).to.eql('npm install mock-module');
  });

  it('should work if the first argument is an array or strings', () => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    npmClient.install(['mock-module@1.0.0', 'another-module@3.4.5']);
    expect(execSpy.getCall(0).args[0]).to.eql('npm install mock-module@1.0.0 another-module@3.4.5');
  });
});
