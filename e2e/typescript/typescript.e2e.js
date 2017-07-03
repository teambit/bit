// covers init, commit, create, import commands and

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const helper = new Helper();
const fooComponentFixture = "export = foo; function foo(): string { return 'got foo'; } ";
const fooImplPath = path.join(helper.localScopePath, 'inline_components', 'global', 'foo', 'impl.ts');
const fooDistPath = path.join(helper.localScopePath, 'inline_components', 'global', 'foo', 'dist', 'impl.js');

// todo: once the bind is implemented, make it work
describe.skip('typescript', function () {
  this.timeout(0);
  after(() => {
    helper.destroyEnv();
  });

  describe('impl files generation', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.runCmd('bit import bit.envs/compilers/typescript --compiler');
      const bitJsonPath = path.join(helper.localScopePath, 'bit.json');
      const bitJson = JSON.parse(fs.readFileSync(bitJsonPath).toString());
      bitJson.sources.impl = 'impl.ts';
      bitJson.sources.spec = 'spec.ts';
      fs.writeFileSync(bitJsonPath, JSON.stringify(bitJson, null, 4));
      helper.runCmd('bit create foo');
    });
    it('should create the impl file with "ts" extension', () => {
      expect(fs.existsSync(fooImplPath)).to.be.true;
    });
    it('should save the compiled file into dist/impl.js', () => {
      fs.writeFileSync(fooImplPath, fooComponentFixture);
      helper.runCmd('bit build -i foo');
      expect(fs.existsSync(fooDistPath)).to.be.true;
    });
    it('should keep the file name impl.js after commit', () => {
      helper.runCmd('bit commit foo commit-msg');
      const distPath = path.join(helper.localScopePath, 'components', 'global', 'foo', helper.localScope, '1', 'dist', 'impl.js');
      expect(fs.existsSync(distPath)).to.be.true;
    });
  });
});
