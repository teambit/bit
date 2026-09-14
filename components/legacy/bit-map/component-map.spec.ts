import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { BIT_HIDDEN_DIR, BIT_WORKSPACE_TMP_DIRNAME, DOT_GIT_DIR } from '@teambit/legacy.constants';
import { getFilesByDir, getGitIgnoreHarmony, getIgnoreListHarmony, WORKSPACE_ROOT_DIR } from './component-map';

const createWorkspace = async (prefix: string, files: Record<string, string>): Promise<string> => {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await Promise.all(
    Object.entries(files).map(([file, content]) => fs.outputFile(path.join(workspacePath, file), content))
  );
  return workspacePath;
};

describe('getFilesByDir', function () {
  this.timeout(0);
  describe('trackAllFiles', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = await createWorkspace('bit-track-all-files-', {
        '.gitignore': 'dist/\n',
        'comp/index.ts': '',
        'comp/package.json': '',
        'comp/tsconfig.json': '',
        'comp/package-lock.json': '',
        'comp/dist/index.js': '',
        'comp/node_modules/dep/index.js': '',
      });
    });
    after(() => fs.remove(workspacePath));

    const filesOf = async (trackAllFiles: boolean): Promise<string[]> => {
      const gitIgnore = await getGitIgnoreHarmony(workspacePath, undefined, trackAllFiles);
      const files = await getFilesByDir('comp', workspacePath, gitIgnore, [], trackAllFiles);
      return files.map((file) => file.relativePath).sort();
    };

    it('should skip the files bit generates, and the lockfiles, by default', async () => {
      expect(await filesOf(false)).to.deep.equal(['index.ts']);
    });
    it('should track them with the flag on, while still honoring .gitignore and skipping node_modules', async () => {
      expect(await filesOf(true)).to.deep.equal(['index.ts', 'package-lock.json', 'package.json', 'tsconfig.json']);
    });
    it('should keep the user ignore patterns and the hard exclusions with the flag on', async () => {
      const ignoreList = await getIgnoreListHarmony(workspacePath, ['*.bak'], true);
      expect(ignoreList).to.include('*.bak');
      expect(ignoreList).to.include('**/node_modules/**');
      expect(ignoreList).to.not.include('package.json');
    });
    it('should keep a lockfile pattern the user wrote, even though bit drops its own', async () => {
      const otherWorkspace = await createWorkspace('bit-user-lockfile-', { '.gitignore': '**/yarn.lock\n' });
      try {
        const ignoreList = await getIgnoreListHarmony(otherWorkspace, undefined, true);
        expect(ignoreList).to.include('**/yarn.lock');
        expect(ignoreList).to.not.include('**/package-lock.json');
      } finally {
        await fs.remove(otherWorkspace);
      }
    });
  });

  describe('scanning the workspace root', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = await createWorkspace('bit-workspace-root-scan-', {
        'README.md': '',
        '.bitmap': '',
        // the root's rules ignore every nested .bitignore file - a nested one still applies, as in git
        '.gitignore': 'docs/*.txt\n**/.bitignore\n',
        'workspace.jsonc': '',
        '.github/ci.yml': '',
        // a git worktree or submodule: .git is a pointer file, not a directory
        [DOT_GIT_DIR]: 'gitdir: /elsewhere/.git/worktrees/this\n',
        [`${BIT_HIDDEN_DIR}/objects/aa`]: '',
        [`${BIT_WORKSPACE_TMP_DIRNAME}/x`]: '',
        'node_modules/dep/index.js': '',
        'packages/comp1/index.ts': '',
        // a map at a nested component's root is never its file (that dir would be a nested workspace)
        'packages/comp1/.bitmap': '',
        // a nested component whose root-dir is glob syntax (a Next.js route), next to a dir that
        // the unescaped pattern "app/[slug]" would match instead
        'app/[slug]/page.ts': '',
        'app/l/index.ts': '',
        // a vendored repository and a nested bit workspace that no component claims
        'vendor/lib/.git/HEAD': '',
        'vendor/lib/index.js': '',
        'vendor/lib/.bitignore': 'generated/\n',
        'vendor/lib/generated/x.js': '',
        'nested/.bit/objects/bb': '',
        'nested/.bit.map.json': '',
        'nested/.bitmap': '',
        // an ignore file below the root applies to its directory, like git: unanchored patterns at any
        // depth below it, anchored ones to it
        // and a nested negation re-includes a file the root's rule excluded, evaluated in git's order,
        // but never one of the files bit always excludes
        'docs/.gitignore': 'build/\n/local.env\ntmp/\n!keep.txt\n!.env\n',
        'docs/index.md': '',
        'docs/notes.txt': '',
        'docs/keep.txt': '',
        'docs/.env': 'SECRET=1\n',
        'docs/build/out.html': '',
        'docs/local.env': '',
        'docs/nested/local.env': '',
        // "tmp/" ignores directories only. this is a file
        'docs/tmp': '',
      });
    });
    after(() => fs.remove(workspacePath));

    // bit runs with the workspace as its cwd. globby stats ignore patterns relative to the process
    // cwd, so the `.git` pointer file is only exercised from inside the workspace.
    const scanFromInsideTheWorkspace = async (dir: string, excludeDirs: string[]): Promise<string[]> => {
      const originalCwd = process.cwd();
      process.chdir(workspacePath);
      try {
        const gitIgnore = await getGitIgnoreHarmony(workspacePath);
        const files = await getFilesByDir(dir, workspacePath, gitIgnore, excludeDirs);
        return files.map((file) => file.relativePath).sort();
      } finally {
        process.chdir(originalCwd);
      }
    };

    it('should own every file no other component claims, and skip the bit and git internals', async () => {
      expect(await scanFromInsideTheWorkspace(WORKSPACE_ROOT_DIR, ['packages/comp1', 'app/[slug]'])).to.deep.equal([
        '.bitmap',
        '.github/ci.yml',
        '.gitignore',
        'README.md',
        'app/l/index.ts',
        'docs/.gitignore',
        'docs/index.md',
        'docs/keep.txt',
        'docs/nested/local.env',
        'docs/tmp',
        'vendor/lib/index.js',
        'workspace.jsonc',
      ]);
    });
    it('should scan a nested component in a git worktree, where .git is a file', async () => {
      expect(await scanFromInsideTheWorkspace('packages/comp1', [])).to.deep.equal(['index.ts']);
    });
  });
});
