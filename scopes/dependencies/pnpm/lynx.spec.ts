import { expect } from 'chai';
import type { PackageManifest } from '@pnpm/types';
import { createReadPackageHooks, mergeBitLockfileAttrs, resolveScriptPolicies, sortDepsRequiringBuild } from './lynx';

describe('resolveScriptPolicies()', () => {
  it('should pass through the pnpm allow-all builds flag', () => {
    expect(resolveScriptPolicies({ dangerouslyAllowAllScripts: true })).to.deep.equal({
      allowBuilds: {},
      dangerouslyAllowAllBuilds: true,
    });
  });

  it('should preserve explicit never-built packages instead of passing the allow-all builds flag', () => {
    expect(
      resolveScriptPolicies({
        dangerouslyAllowAllScripts: true,
        neverBuiltDependencies: ['native-pkg'],
      })
    ).to.deep.equal({
      allowBuilds: {
        'native-pkg': false,
      },
      neverBuildPackageNames: ['native-pkg'],
    });
  });
});

describe('createReadPackageHooks()', () => {
  it('should install workspace peer dependencies when the project has no runtime dependencies', () => {
    const manifest = createReadPackageHooks({ rootComponents: true }).reduce<PackageManifest>(
      (current, hook) => hook(current, '/workspace/components/peer-only') as PackageManifest,
      {
        name: '@scope/peer-only',
        version: '1.0.0',
        peerDependencies: {
          '@apollo/client': '^3.12.0',
        },
      }
    );

    expect(manifest.dependencies).to.deep.equal({
      '@apollo/client': '^3.12.0',
    });
  });
});

describe('sortDepsRequiringBuild()', () => {
  it('should sort the reported list', () => {
    expect(sortDepsRequiringBuild(['esbuild@0.14.29', 'core-js@3.39.0'])).to.deep.equal([
      'core-js@3.39.0',
      'esbuild@0.14.29',
    ]);
  });

  it('should keep an empty list, which reports that nothing requires a build', () => {
    expect(sortDepsRequiringBuild([])).to.deep.equal([]);
  });

  it('should report no list when the install did not compute one', () => {
    expect(sortDepsRequiringBuild(undefined)).to.equal(undefined);
  });
});

describe('mergeBitLockfileAttrs()', () => {
  it('should preserve the recorded list when the install did not compute one', () => {
    expect(mergeBitLockfileAttrs({ depsRequiringBuild: ['core-js@3.39.0'] }, undefined)).to.deep.equal({
      depsRequiringBuild: ['core-js@3.39.0'],
    });
  });

  it('should replace the recorded list when the install computed one', () => {
    expect(mergeBitLockfileAttrs({ depsRequiringBuild: ['core-js@3.39.0'] }, ['esbuild@0.14.29'])).to.deep.equal({
      depsRequiringBuild: ['esbuild@0.14.29'],
    });
  });

  it('should record an empty list when the install found nothing requiring a build', () => {
    expect(mergeBitLockfileAttrs({ depsRequiringBuild: ['core-js@3.39.0'] }, [])).to.deep.equal({
      depsRequiringBuild: [],
    });
  });

  it('should keep other bit attributes captured before the install', () => {
    expect(mergeBitLockfileAttrs({ restoredFromModel: true }, ['esbuild@0.14.29'])).to.deep.equal({
      restoredFromModel: true,
      depsRequiringBuild: ['esbuild@0.14.29'],
    });
  });

  it('should write nothing when there is neither a computed list nor a recorded block', () => {
    expect(mergeBitLockfileAttrs(undefined, undefined)).to.equal(undefined);
  });
});
