import os from 'os';
import { join } from 'path';
import { promisify } from 'util';
import fs from 'fs-extra';
import { expect } from 'chai';
import { rspack } from '@rspack/core';
import { cssParser, styleRules, fontRule } from './rspack.common';

/**
 * Regression coverage for the node_modules/first-party split in `styleRules()`. Rspack v2's CSS
 * handler treats every `url()` as a module to read, which throws on an absolute (e.g. CDN)
 * `https:` url - vendored stylesheets are exempted from `url` resolution for that reason (see
 * `vendorCssParser` in rspack.common.ts). This build proves the exemption is scoped correctly:
 * a first-party stylesheet's local relative url still goes through the real asset pipeline, and
 * only a vendored (node_modules) stylesheet's absolute url is left untouched.
 */
describe('styleRules', () => {
  let tmpDir: string;
  let outDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'bit-rspack-style-rules-'));
    outDir = join(tmpDir, 'dist');

    fs.outputFileSync(join(tmpDir, 'src/first-party.module.scss'), `.icon { background: url('./icon.svg'); }\n`);
    // padded well past rspack's default inline-asset threshold (~8KB), so this emits as a
    // separate file - like a real font/image asset would - instead of an inlined data: URI.
    fs.outputFileSync(join(tmpDir, 'src/icon.svg'), `<svg><!-- ${'x'.repeat(9000)} --></svg>`);
    fs.outputFileSync(
      join(tmpDir, 'src/entry.js'),
      `import './first-party.module.scss';\nimport 'vendor-pkg/vendor.module.scss';\n`
    );
    fs.outputFileSync(
      join(tmpDir, 'node_modules/vendor-pkg/vendor.module.scss'),
      `.brand { background: url('https://cdn.example.com/font.woff2'); }\n`
    );
  });

  after(() => {
    fs.removeSync(tmpDir);
  });

  it('resolves a first-party relative url() through the asset pipeline while leaving a vendored absolute url() untouched', async () => {
    const compiler = rspack({
      context: tmpDir,
      entry: join(tmpDir, 'src/entry.js'),
      mode: 'production',
      output: { path: outDir, filename: 'bundle.js' },
      module: {
        parser: cssParser,
        rules: [...styleRules({ sourceMap: false }), fontRule()],
      },
    } as any);

    try {
      const run = promisify(compiler.run.bind(compiler));
      const stats = await run();
      expect(stats?.hasErrors(), stats?.toString({ errorDetails: true })).to.be.false;

      const assetNames = Object.keys((stats as any).compilation.assets);
      const cssAssetName = assetNames.find((name) => name.endsWith('.css'));
      expect(cssAssetName, `no .css asset emitted, got: ${assetNames.join(', ')}`).to.exist;
      const css = fs.readFileSync(join(outDir, cssAssetName as string), 'utf8');

      // vendored url() is left as literal text - not resolved, not fetched.
      expect(css).to.include('https://cdn.example.com/font.woff2');

      // first-party url() went through fontRule's asset pipeline instead of being left literal.
      expect(css).to.not.include("url('./icon.svg')");
      expect(css).to.not.include('url("./icon.svg")');
      const emittedIconName = assetNames.find((name) => name.includes('static/fonts') && name.endsWith('.svg'));
      expect(emittedIconName, `no emitted icon asset, got: ${assetNames.join(', ')}`).to.exist;
      expect(fs.existsSync(join(outDir, emittedIconName as string))).to.be.true;
    } finally {
      await new Promise<void>((done) => compiler.close(() => done()));
    }
  });
});
