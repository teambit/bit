import { expect } from 'chai';
import { existsSync, readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getCoreAspectPackageName } from '@teambit/aspect-loader';
import {
  buildUiVendorDll,
  resolveUiVendorDllPackages,
  resolvePackageDirFromNodeModules,
  UI_VENDOR_DLL_EXTRA_PACKAGES,
  UI_VENDOR_DLL_DIR,
  UI_VENDOR_DLL_MANIFEST_FILENAME,
  UI_VENDOR_DLL_CHUNK_FILENAME,
} from './ui-vendor-dll';

describe('resolveUiVendorDllPackages', () => {
  it('includes react/react-dom plus any core aspect package with a ui or preview runtime file', () => {
    const fakeDirs: Record<string, string> = {
      'teambit.ui-foundation/ui': '/fake/ui',
      'teambit.preview/preview': '/fake/preview',
      'teambit.component/component-sizer': '/fake/component-sizer',
      'teambit.scope/scope': '/fake/scope', // main-runtime only, no ui/preview runtime
    };
    const distFiles: Record<string, string[]> = {
      '/fake/ui/dist': ['ui.aspect.js', 'ui.main.runtime.js', 'ui.ui.runtime.js'],
      '/fake/preview/dist': ['preview.aspect.js', 'preview.main.runtime.js', 'preview.preview.runtime.js'],
      '/fake/component-sizer/dist': ['component-sizer.aspect.js', 'component-sizer.main.runtime.js'],
      '/fake/scope/dist': ['scope.aspect.js', 'scope.main.runtime.js'],
    };
    const readdirSyncStub = (dir: string) => distFiles[dir] || [];
    const existsSyncStub = (p: string) => p in distFiles;

    const resolvePackageDir = (packageName: string) => {
      const id = Object.keys(fakeDirs).find((aspectId) => getCoreAspectPackageName(aspectId) === packageName);
      return id ? fakeDirs[id] : undefined;
    };

    const result = resolveUiVendorDllPackages(
      [
        'teambit.ui-foundation/ui',
        'teambit.preview/preview',
        'teambit.component/component-sizer',
        'teambit.scope/scope',
      ],
      resolvePackageDir,
      { readdirSync: readdirSyncStub, existsSync: existsSyncStub }
    );

    expect(result).to.include.members(['react', 'react-dom']);
    expect(result).to.include('@teambit/ui'); // getCoreAspectPackageName('teambit.ui-foundation/ui')
    expect(result).to.include('@teambit/preview'); // getCoreAspectPackageName('teambit.preview/preview')
    expect(result).to.not.include('@teambit/scope'); // getCoreAspectPackageName('teambit.scope/scope')
  });

  it('always includes UI_VENDOR_DLL_EXTRA_PACKAGES even with an empty core aspect list', () => {
    const result = resolveUiVendorDllPackages([], () => undefined, {
      readdirSync: () => [],
      existsSync: () => false,
    });
    expect(result).to.deep.equal(UI_VENDOR_DLL_EXTRA_PACKAGES);
  });
});

describe('buildUiVendorDll', function () {
  this.timeout(30000); // real rspack compilation

  let outputPath: string;
  before(async () => {
    outputPath = mkdtempSync(join(tmpdir(), 'ui-vendor-dll-test-'));
    await buildUiVendorDll(outputPath, ['lodash.compact']);
  });
  after(() => rmSync(outputPath, { recursive: true, force: true }));

  it('writes a manifest.json naming the covered package', () => {
    const manifestPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_MANIFEST_FILENAME);
    expect(existsSync(manifestPath)).to.equal(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).to.equal('__bitUiVendor__');
    expect(Object.keys(manifest.content).some((k) => k.includes('lodash.compact'))).to.equal(true);
  });

  it('writes a vendor.js chunk', () => {
    const chunkPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_CHUNK_FILENAME);
    expect(existsSync(chunkPath)).to.equal(true);
    expect(readFileSync(chunkPath, 'utf-8').length).to.be.greaterThan(0);
  });
});

describe('buildUiVendorDll with multiple packages', function () {
  this.timeout(30000); // real rspack compilation

  let outputPath: string;
  before(async () => {
    outputPath = mkdtempSync(join(tmpdir(), 'ui-vendor-dll-test-multi-'));
    await buildUiVendorDll(outputPath, ['lodash.compact', 'lodash.flatten']);
  });
  after(() => rmSync(outputPath, { recursive: true, force: true }));

  it('produces a single combined DLL chunk covering all packages', () => {
    const chunkPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_CHUNK_FILENAME);
    expect(existsSync(chunkPath)).to.equal(true);
    expect(readFileSync(chunkPath, 'utf-8').length).to.be.greaterThan(0);
  });

  it('writes a manifest with all packages covered and real module ids', () => {
    const manifestPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_MANIFEST_FILENAME);
    expect(existsSync(manifestPath)).to.equal(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).to.equal('__bitUiVendor__');
    const contentKeys = Object.keys(manifest.content);
    expect(contentKeys.some((k) => k.includes('lodash.compact'))).to.equal(true);
    expect(contentKeys.some((k) => k.includes('lodash.flatten'))).to.equal(true);

    // Verify all manifest entries have real ids (not fabricated values)
    contentKeys.forEach((k) => {
      expect(manifest.content[k]).to.have.property('id');
      const idType = typeof manifest.content[k].id;
      expect(['number', 'string']).to.include(idType, `Entry ${k} has invalid id type: ${idType}`);
    });
  });
});

describe('buildUiVendorDll requires the matched runtime file directly, not the bare package', function () {
  this.timeout(30000); // real rspack compilation

  // a small, fully controlled fake package instead of a real bit package: every real core-aspect
  // package tried (`@teambit/pnpm`, `@teambit/preview`) turned out to have its own, unrelated
  // real-world bundling wrinkle (a native binary loader; an unbundlable transitive dependency of its
  // *other* runtime file) that this test isn't about - this isolates exactly the one thing being
  // verified: the bare package's main entry pulls in something unbundlable, but the matched
  // `.ui.runtime.js` file alone does not, and requiring it directly (not the bare package) is what
  // makes the build succeed.
  const fakePackageName = 'ui-vendor-dll-test-fake-pkg';
  let fakePackageDir: string;
  let outputPath: string;

  before(async () => {
    const nodeModulesDir = require.resolve.paths('chai')![0];
    fakePackageDir = join(nodeModulesDir, fakePackageName);
    mkdirSync(join(fakePackageDir, 'dist'), { recursive: true });
    writeFileSync(
      join(fakePackageDir, 'package.json'),
      JSON.stringify({ name: fakePackageName, main: 'dist/index.js' })
    );
    // the bare package's main entry requires something that cannot resolve in a DLL build - standing
    // in for what a real package's *other* runtime file (main/preview) often pulls in.
    writeFileSync(
      join(fakePackageDir, 'dist', 'index.js'),
      `require('${fakePackageName}-nonexistent-dependency');\nmodule.exports = require('./fake.ui.runtime.js');`
    );
    writeFileSync(join(fakePackageDir, 'dist', 'fake.ui.runtime.js'), `module.exports = { kind: 'ui' };`);

    outputPath = mkdtempSync(join(tmpdir(), 'ui-vendor-dll-test-fake-pkg-'));
    await buildUiVendorDll(outputPath, [fakePackageName]);
  });
  after(() => {
    rmSync(outputPath, { recursive: true, force: true });
    rmSync(fakePackageDir, { recursive: true, force: true });
  });

  it('succeeds (the bare package would have failed to resolve) and keys the manifest by the runtime-file path', () => {
    const manifestPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_MANIFEST_FILENAME);
    expect(existsSync(manifestPath)).to.equal(true);
    const contentKeys = Object.keys(JSON.parse(readFileSync(manifestPath, 'utf-8')).content);
    expect(contentKeys.some((k) => k.includes(`${fakePackageName}/dist/fake.ui.runtime.js`))).to.equal(true);
    expect(contentKeys).to.not.include(fakePackageName);
  });
});

describe('resolveUiVendorDllPackages (real core aspects)', () => {
  it('covers teambit.ui-foundation/ui and teambit.preview/preview, and excludes a package with no ui/preview runtime', () => {
    // a small, explicit real id list rather than the full core-aspect list - this test file must
    // never import anything from @teambit/bit either (see the note on Correction 2 in the plan:
    // importing @teambit/bit from within teambit.ui-foundation/ui balloons its dependency graph and
    // breaks the existing pre-bundle build; not confirmed whether a test-only import is equally
    // affected, and not worth finding out).
    const result = resolveUiVendorDllPackages(
      ['teambit.ui-foundation/ui', 'teambit.preview/preview', 'teambit.harmony/bit'],
      resolvePackageDirFromNodeModules
    );
    expect(result).to.include(getCoreAspectPackageName('teambit.ui-foundation/ui'));
    expect(result).to.include(getCoreAspectPackageName('teambit.preview/preview'));
    // teambit.harmony/bit ships only a main.runtime (it's the CLI/loader entry point, not a UI
    // root) - verified against its actual dist/ output. teambit.scope/scope is deliberately NOT used
    // here as the negative example: it actually does ship its own scope.ui.runtime.js and is
    // correctly included by resolveUiVendorDllPackages - verified against its real dist/ output.
    expect(result).to.not.include(getCoreAspectPackageName('teambit.harmony/bit'));
  });
});
