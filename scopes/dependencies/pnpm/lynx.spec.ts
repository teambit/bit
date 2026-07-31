import { expect } from 'chai';
import type { PackageManifest } from '@pnpm/types';
import { createReadPackageHooks, resolveScriptPolicies } from './lynx';

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
