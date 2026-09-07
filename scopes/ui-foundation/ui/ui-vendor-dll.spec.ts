import { expect } from 'chai';
import { existsSync, readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative, sep } from 'path';
import { getCoreAspectPackageName } from '@teambit/aspect-loader';
import type { UiVendorDllManifest } from './ui-vendor-dll';
import {
  buildUiVendorDll,
  resolveUiVendorDllPackages,
  resolvePackageDirFromNodeModules,
  resolveUiVendorDllPaths,
  toPortableUiVendorDllKey,
  toPortableUiVendorDllManifest,
  createUiVendorDllReference,
  UI_VENDOR_DLL_EXTRA_PACKAGES,
  UI_VENDOR_DLL_DIR,
  UI_VENDOR_DLL_MANIFEST_FILENAME,
  UI_VENDOR_DLL_CHUNK_FILENAME,
  UI_VENDOR_DLL_CSS_FILENAME,
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

  it('ships the manifest keyed by package specifier, carrying nothing from this install layout', () => {
    const manifestPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_MANIFEST_FILENAME);
    const contentKeys = Object.keys(JSON.parse(readFileSync(manifestPath, 'utf-8')).content);
    expect(contentKeys).to.include('./lodash.compact/index.js');
    contentKeys.forEach((key) => {
      expect(key).to.not.include('node_modules', `${key} still carries a node_modules path`);
      expect(key).to.not.include('.pnpm', `${key} still carries a pnpm store path`);
    });
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

describe('toPortableUiVendorDllKey', () => {
  it('strips a pnpm virtual store path down to package + subpath', () => {
    expect(
      toPortableUiVendorDllKey(
        './node_modules/.pnpm/@teambit+design.ui.time-ago@0.0.388_react@19.2.7/node_modules/@teambit/design.ui.time-ago/dist/index.js'
      )
    ).to.equal('./@teambit/design.ui.time-ago/dist/index.js');
  });

  it('strips a plain top-level node_modules path the same way', () => {
    expect(toPortableUiVendorDllKey('./node_modules/@teambit/component/dist/ui/use-component.js')).to.equal(
      './@teambit/component/dist/ui/use-component.js'
    );
  });

  it('keys a nested dependency by the innermost package that physically holds it', () => {
    expect(toPortableUiVendorDllKey('./node_modules/.pnpm/a@1/node_modules/a/node_modules/b/index.js')).to.equal(
      './b/index.js'
    );
  });

  it('has no key for something that lives in no package at all', () => {
    // externals, remote font urls and the generated entry file - none of them could ever match a
    // module in a consuming build
    expect(toPortableUiVendorDllKey('postcss-preset-env')).to.equal(undefined);
    expect(toPortableUiVendorDllKey('https://static.bit.dev/circular-xx/CircularXXWeb-Regular.woff2')).to.equal(
      undefined
    );
    expect(toPortableUiVendorDllKey('../../artifacts/ui-bundle/ui-vendor-dll/vendor-entry.js')).to.equal(undefined);
  });
});

describe('toPortableUiVendorDllManifest', () => {
  it('re-keys entries, keeps their ids untouched, and drops what belongs to no package', () => {
    const manifest: UiVendorDllManifest = {
      name: '__bitUiVendor__',
      type: 'window',
      content: {
        './node_modules/.pnpm/lodash.compact@3.0.1/node_modules/lodash.compact/index.js': { id: 42, exports: true },
        './node_modules/@teambit/ui/dist/ui.ui.runtime.js': { id: 'abc' },
        'postcss-preset-env': { id: 7 },
      },
    };
    const portable = toPortableUiVendorDllManifest(manifest);
    expect(portable.name).to.equal('__bitUiVendor__');
    expect(portable.type).to.equal('window');
    expect(Object.keys(portable.content)).to.have.members([
      './lodash.compact/index.js',
      './@teambit/ui/dist/ui.ui.runtime.js',
    ]);
    expect(portable.content['./lodash.compact/index.js']).to.deep.equal({ id: 42, exports: true });
  });

  it('covers neither copy when two versions of one package collapse onto the same key', () => {
    // package name + subpath cannot tell two installed versions apart, so there is no single right
    // module to delegate to - the consumer compiles its own instead.
    const manifest: UiVendorDllManifest = {
      name: '__bitUiVendor__',
      type: 'window',
      content: {
        './node_modules/.pnpm/use-debounce@3.4.3_react@19.2.7/node_modules/use-debounce/esm/index.js': { id: 1 },
        './node_modules/.pnpm/use-debounce@7.0.1_react@19.2.7/node_modules/use-debounce/esm/index.js': { id: 2 },
        './node_modules/.pnpm/use-debounce@7.0.1_react@19.2.7/node_modules/use-debounce/esm/other.js': { id: 3 },
      },
    };
    const portable = toPortableUiVendorDllManifest(manifest);
    expect(Object.keys(portable.content)).to.deep.equal(['./use-debounce/esm/other.js']);
  });

  it("normalizes rspack 1.7.12's object-shaped buildMeta.defaultObject to the plain string a newer rspack's DllReferencePlugin requires", () => {
    // real, observed shape from a real build: rspack 1.7.12 (this component's own installed version)
    // serializes a JSON module's "redirect-warn" defaultObject as an object; rspack 2.2.2 (a real
    // consumer install used in end-to-end verification) rejects that object with `StringExpected ...
    // on JsBuildMeta.defaultObject`, failing the consumer's ENTIRE compiler instantiation - not just
    // skipping that one module.
    const manifest: UiVendorDllManifest = {
      name: '__bitUiVendor__',
      type: 'window',
      content: {
        './node_modules/binary-extensions/binary-extensions.json': {
          id: 1,
          buildMeta: {
            strictEsmModule: false,
            exportsType: 'default',
            defaultObject: { redirectWarn: { ignore: true } },
          },
        },
        './node_modules/some-pkg/redirect.json': {
          id: 2,
          buildMeta: { exportsType: 'default', defaultObject: { redirect: {} } },
        },
        './node_modules/some-pkg/plain.js': { id: 3, buildMeta: { exportsType: 'namespace', defaultObject: false } },
      },
    };
    const portable = toPortableUiVendorDllManifest(manifest);
    expect((portable.content['./binary-extensions/binary-extensions.json'].buildMeta as any).defaultObject).to.equal(
      'redirect-warn'
    );
    expect((portable.content['./some-pkg/redirect.json'].buildMeta as any).defaultObject).to.equal('redirect');
    // a non-object defaultObject (or no buildMeta at all) passes through untouched
    expect((portable.content['./some-pkg/plain.js'].buildMeta as any).defaultObject).to.equal(false);
  });
});

describe('createUiVendorDllReference (a separate install with its own layout)', () => {
  const packageName = 'ui-vendor-dll-test-consumer-pkg';
  let consumerDir: string;
  let manifestPath: string;
  // the same package at a path this install could never have produced: a different pnpm peer hash
  const consumerStoreDir = `.pnpm/${packageName}@1.0.0_a-hash-only-this-install-has/node_modules/${packageName}`;

  before(() => {
    consumerDir = realpathSync(mkdtempSync(join(tmpdir(), 'ui-vendor-dll-test-consumer-')));
    const packageDir = join(consumerDir, 'node_modules', consumerStoreDir);
    mkdirSync(join(packageDir, 'dist'), { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: packageName, main: 'dist/index.js' }));
    writeFileSync(join(packageDir, 'dist', 'index.js'), 'module.exports = {};');
    // pnpm's top-level entry for a direct dependency is a symlink into the store, and rspack resolves
    // symlinks by default - so what it compares against is the store path, not this one.
    symlinkSync(join('.', consumerStoreDir), join(consumerDir, 'node_modules', packageName), 'junction');

    manifestPath = join(consumerDir, 'vendor-manifest.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        name: '__bitUiVendor__',
        type: 'window',
        content: {
          [`./${packageName}/dist/index.js`]: { id: 111 },
          [`./${packageName}/dist/not-in-this-install.js`]: { id: 222 },
          './a-package-this-install-does-not-have/index.js': { id: 333 },
        },
      })
    );
  });
  after(() => rmSync(consumerDir, { recursive: true, force: true }));

  it('re-keys each entry by the path this install will actually resolve it to', () => {
    const reference = createUiVendorDllReference(manifestPath, { context: consumerDir })!;
    const expectedKey = `./${relative(consumerDir, join(consumerDir, 'node_modules', consumerStoreDir, 'dist/index.js'))
      .split(sep)
      .join('/')}`;
    expect(Object.keys(reference.content)).to.deep.equal([expectedKey]);
    expect(reference.content[expectedKey]).to.deep.equal({ id: 111 });
    expect(reference.name).to.equal('__bitUiVendor__');
    expect(reference.sourceType).to.equal('window');
    expect(reference.context).to.equal(consumerDir);
  });

  it('returns undefined when the manifest cannot be read', () => {
    expect(createUiVendorDllReference(join(consumerDir, 'no-such-manifest.json'), { context: consumerDir })).to.equal(
      undefined
    );
  });

  it('returns undefined when this install has none of the covered packages', () => {
    const emptyDir = realpathSync(mkdtempSync(join(tmpdir(), 'ui-vendor-dll-test-empty-')));
    try {
      expect(createUiVendorDllReference(manifestPath, { context: emptyDir })).to.equal(undefined);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('resolveUiVendorDllPaths', () => {
  let bundleUiPath: string;
  let dllDir: string;

  before(() => {
    bundleUiPath = mkdtempSync(join(tmpdir(), 'ui-vendor-dll-test-paths-'));
    dllDir = join(bundleUiPath, UI_VENDOR_DLL_DIR);
    mkdirSync(dllDir, { recursive: true });
  });
  after(() => rmSync(bundleUiPath, { recursive: true, force: true }));

  it('returns undefined when the aspect ships no bundle at all', () => {
    expect(resolveUiVendorDllPaths(undefined)).to.equal(undefined);
  });

  it('returns undefined when the bundle exists but carries no dll', () => {
    expect(resolveUiVendorDllPaths(mkdtempSync(join(tmpdir(), 'ui-vendor-dll-test-no-dll-')))).to.equal(undefined);
  });

  it('returns the manifest and chunk, and no cssPath, for an artifact built before the dll emitted css', () => {
    writeFileSync(join(dllDir, UI_VENDOR_DLL_MANIFEST_FILENAME), '{}');
    writeFileSync(join(dllDir, UI_VENDOR_DLL_CHUNK_FILENAME), '');
    const paths = resolveUiVendorDllPaths(bundleUiPath)!;
    expect(paths.manifestPath).to.equal(join(dllDir, UI_VENDOR_DLL_MANIFEST_FILENAME));
    expect(paths.chunkPath).to.equal(join(dllDir, UI_VENDOR_DLL_CHUNK_FILENAME));
    expect(paths.cssPath).to.equal(undefined);
  });

  it('returns the css alongside them once the artifact has it', () => {
    writeFileSync(join(dllDir, UI_VENDOR_DLL_CSS_FILENAME), '');
    expect(resolveUiVendorDllPaths(bundleUiPath)!.cssPath).to.equal(join(dllDir, UI_VENDOR_DLL_CSS_FILENAME));
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
