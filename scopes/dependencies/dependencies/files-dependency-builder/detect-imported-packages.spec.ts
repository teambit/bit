import { expect } from 'chai';
import { DetectorHook } from '@teambit/dependency-resolver';
import { detectImportedPackages } from './detect-imported-packages';

describe('detectImportedPackages', () => {
  const index = {
    relativePath: 'index.ts',
    content: `import a from './a';
import b from '@scope/b/dist/x';
import fs from 'fs';
import path from 'node:path';
import lodash from 'lodash';
const chalk = require('chalk');`,
  };
  const spec = {
    relativePath: 'index.spec.ts',
    content: `import { expect } from 'chai';\nimport lodash from 'lodash';`,
  };
  const isDevFile = (relativePath: string) => relativePath.endsWith('.spec.ts');

  it('should return the imported packages, without files and node built-ins', async () => {
    const packages = await detectImportedPackages([index], isDevFile);
    expect(Object.fromEntries(packages!)).to.deep.equal({
      '@scope/b': 'runtime',
      lodash: 'runtime',
      chalk: 'runtime',
    });
  });
  it('should set a package that only dev files import as dev', async () => {
    const packages = await detectImportedPackages([spec, index], isDevFile);
    expect(packages!.get('chai')).to.equal('dev');
    expect(packages!.get('lodash')).to.equal('runtime');
  });
  it('should find packages imported by style files', async () => {
    const scss = { relativePath: 'style.scss', content: `@import '~@scope/theme/colors';` };
    const packages = await detectImportedPackages([scss]);
    expect([...packages!.keys()]).to.deep.equal(['@scope/theme']);
  });
  it('should ignore a file of a type without imports', async () => {
    const png = { relativePath: 'logo.png', content: 'not-really-a-png' };
    const packages = await detectImportedPackages([png, index]);
    expect(packages!.size).to.equal(3);
  });
  it('should ignore a file with a @bit-no-check comment', async () => {
    const noCheck = { relativePath: 'no-check.ts', content: `// @bit-no-check\nimport x from 'x';` };
    const packages = await detectImportedPackages([noCheck]);
    expect(packages!.size).to.equal(0);
  });
  it('should return undefined when only an env detector supports a file', async () => {
    const vue = { relativePath: 'comp.vue', content: `<script>import x from 'x';</script>` };
    expect(await detectImportedPackages([vue, index])).to.equal(undefined);
  });
  it('should not share the imports of files with the same content and different names', async () => {
    // e.g. the env.jsonc detector, which supports a file by its name
    DetectorHook.hooks.push({
      isSupported: ({ filename }) => filename.endsWith('env.jsonc'),
      detect: () => ['@scope/base-env'],
    });
    try {
      const content = '{ "extends": "@scope/base-env" }';
      const files = [
        { relativePath: 'config.jsonc', content },
        { relativePath: 'env.jsonc', content },
      ];
      expect([...(await detectImportedPackages(files))!.keys()]).to.deep.equal(['@scope/base-env']);
    } finally {
      DetectorHook.hooks.pop();
    }
  });
  it('should return undefined when a file can not be parsed', async () => {
    const broken = { relativePath: 'broken.js', content: `import { from` };
    expect(await detectImportedPackages([broken, index])).to.equal(undefined);
  });
});
