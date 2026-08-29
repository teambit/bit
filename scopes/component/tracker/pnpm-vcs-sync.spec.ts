import { expect } from 'chai';
import { assignFilesToProjects } from './pnpm-vcs-sync.cmd';

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
});
