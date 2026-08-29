import { expect } from 'chai';
import { BitError } from '@teambit/bit-error';
import { assignFilesToProjects, requirementsForProfile, validateWorkspaceRequirements } from './pnpm-vcs-sync.cmd';

describe('pnpm VCS workspace ownership', () => {
  it('assigns project files to the deepest project and leaves unclaimed files to the root component', () => {
    const result = assignFilesToProjects(
      [
        'pnpm-workspace.yaml',
        'pnpm-lock.yaml',
        'packages/app/package.json',
        'packages/app/index.ts',
        'packages/app/plugins/auth/package.json',
        'packages/app/plugins/auth/index.ts',
      ],
      [
        { rootDir: 'packages/app', componentName: 'app', manifestFile: 'package.json' },
        {
          rootDir: 'packages/app/plugins/auth',
          componentName: 'auth',
          manifestFile: 'package.json',
        },
      ]
    );

    expect(result.rootFiles).to.deep.equal(['pnpm-workspace.yaml', 'pnpm-lock.yaml']);
    expect(result.filesByRoot.get('packages/app')).to.deep.equal(['package.json', 'index.ts']);
    expect(result.filesByRoot.get('packages/app/plugins/auth')).to.deep.equal(['package.json', 'index.ts']);
  });

  it('accepts an aggregate toolchain and granular runtime requirement', () => {
    const profile = {
      toolchain: { implementation: 'bit', version: '2.2.23' },
      node: { implementation: 'node', version: '22.18.0' },
    };

    expect(() =>
      validateWorkspaceRequirements(
        profile,
        {
          toolchain: { implementation: 'bit', version: '^2.2' },
          node: { implementation: 'node', version: '>=20 <23' },
        },
        'packages/app'
      )
    ).not.to.throw();
  });

  it('rejects a different implementation in the same capability slot', () => {
    expect(() =>
      validateWorkspaceRequirements(
        { toolchain: { implementation: 'bun', version: '1.2.3' } },
        { toolchain: { implementation: 'deno', version: '^2' } },
        'packages/app'
      )
    ).to.throw(BitError, 'requires toolchain implementation deno, but the workspace selects bun');
  });

  it('rejects a selected version outside the component range', () => {
    expect(() =>
      validateWorkspaceRequirements(
        { toolchain: { implementation: 'bit', version: '3.0.0' } },
        { toolchain: { implementation: 'bit', version: '^2.2' } },
        'packages/app'
      )
    ).to.throw(BitError, 'requires toolchain bit@^2.2, but the workspace selects bit@3.0.0');
  });

  it('uses the locked profile as the default requirement for undeclared components', () => {
    const profile = {
      toolchain: { implementation: 'vite-plus', version: '1.4.0' },
    };

    expect(requirementsForProfile(profile)).to.deep.equal(profile);
    expect(requirementsForProfile(profile)).not.to.equal(profile);
  });
});
