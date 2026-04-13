import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit cat command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('basic usage', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo("module.exports = function foo() { return 'v1'; };\n");
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
    });

    it('should show all source files with headers', () => {
      output = helper.command.runCmd('bit cat bar/foo');
      expect(output).to.have.string('--- foo.js ---');
      expect(output).to.have.string("return 'v1'");
    });

    it('should show a specific file with --file (raw, no header)', () => {
      output = helper.command.runCmd('bit cat bar/foo --file foo.js');
      expect(output).to.not.have.string('---');
      expect(output).to.have.string("return 'v1'");
    });

    it('should error when --file references a non-existent file', () => {
      const func = () => helper.command.runCmd('bit cat bar/foo --file nonexistent.js');
      expect(func).to.throw();
    });

    it('should show config with --config', () => {
      output = helper.command.runCmd('bit cat bar/foo --config');
      expect(output).to.not.have.string('--- foo.js ---');
    });

    it('should show both files and config with --all', () => {
      output = helper.command.runCmd('bit cat bar/foo --all');
      expect(output).to.have.string('--- foo.js ---');
    });

    it('should output valid JSON with --json', () => {
      const jsonOutput = helper.command.runCmd('bit cat bar/foo --json');
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).to.have.property('id');
      expect(parsed).to.have.property('version');
      expect(parsed).to.have.property('files');
      expect(parsed.files).to.be.an('array');
      expect(parsed.files[0]).to.have.property('path', 'foo.js');
      expect(parsed.files[0]).to.have.property('content');
    });
  });

  describe('versioned component', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo("module.exports = function foo() { return 'v1'; };\n");
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents('', '0.0.1');
      helper.fixtures.createComponentBarFoo("module.exports = function foo() { return 'v2'; };\n");
      helper.command.tagAllComponents('', '0.0.2');
    });

    it('should show files at a specific historical version', () => {
      const output = helper.command.runCmd('bit cat bar/foo@0.0.1');
      expect(output).to.have.string("return 'v1'");
      expect(output).to.not.have.string("return 'v2'");
    });

    it('should show the latest version when no version is specified', () => {
      const output = helper.command.runCmd('bit cat bar/foo');
      expect(output).to.have.string("return 'v2'");
    });
  });
});
