import { expect } from 'chai';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildUiVendorDll,
  resolveUiVendorDllPackages,
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
      const toPackageName = (aspectId: string) => {
        const [scope, ...nameParts] = aspectId.split('/');
        return `@${scope.replace('.', '/')}.${nameParts.join('.')}`;
      };
      const id = Object.keys(fakeDirs).find((aspectId) => toPackageName(aspectId) === packageName);
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
    expect(result).to.include('@teambit/ui-foundation.ui');
    expect(result).to.include('@teambit/preview.preview');
    expect(result).to.not.include('@teambit/scope.scope');
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
