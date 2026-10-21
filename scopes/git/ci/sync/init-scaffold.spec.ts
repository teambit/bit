import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import {
  WORKFLOW_RELATIVE_PATHS,
  renderBitSyncWorkflow,
  renderBitReleaseWorkflow,
  scaffoldWorkflowFiles,
  deriveOwnerRepo,
  renderInitReport,
  shellQuote,
  chooseInitDefaultBranch,
  suggestedServerUrl,
  isLocalPathRemote,
  redactRemoteUrl,
  escapeControlChars,
} from './init-scaffold';
import type { OwnerRepo } from './init-scaffold';

const yamlLoad = (src: string) => YAML.parse(src);

/** YAML 1.1-schema parsers resolve the plain scalar key `on` to `true`, so accept either key. */
function onSection(rendered: string): any {
  const doc = yamlLoad(rendered) as any;
  return doc.on ?? doc[true as any];
}

/**
 * Parsed, not substring-matched: the substitution point sits inside a YAML flow sequence, where `,` and
 * `]` are structural and a substring match is blind to exactly the damage an unquoted value does. `$` is
 * git-legal and `$&`/`$'`/`$$` are special in a string replacement, so those must arrive verbatim too.
 */
const BRANCHES = ['main', 'develop', 'release/2026', 'release/main', 'a,b]c', "it's/a-branch", "a$'b", 'a$&b', 'a$$b', 'a$`b']; // prettier-ignore

describe('init-scaffold', () => {
  describe('the rendered workflows', () => {
    it('put the default branch in as exactly one element of each template’s branch filter', () => {
      BRANCHES.forEach((branch) => {
        expect(onSection(renderBitSyncWorkflow(branch)).push['branches-ignore'], branch).to.deep.equal([
          branch,
          'bit-sync/**',
        ]);
        expect(onSection(renderBitReleaseWorkflow(branch)).pull_request.branches, branch).to.deep.equal([branch]);
      });
    });

    it('quote the value rather than escape it, and touch nothing else in the document', () => {
      const sync = renderBitSyncWorkflow('develop');
      const release = renderBitReleaseWorkflow('develop');
      expect(sync).to.contain("branches-ignore: ['develop', 'bit-sync/**']");
      expect(release).to.contain("branches: ['develop']");
      // a naive replace-all of "main" would rewrite every one of these
      expect(sync).to.contain('main-sync-branch: bit-sync/main');
      expect(sync).to.contain('bit-main-export');
      expect(sync).to.contain('main export)');
      expect(sync).to.contain('${{ secrets.BIT_CONFIG_ACCESS_TOKEN }}');
      expect(release).to.contain("github.event.pull_request.head.ref != 'bit-sync/main'");
      expect(release).to.contain('main-sync-branch: bit-sync/main');
      // YAML single-quote escaping, and the rest of the document intact
      expect(renderBitSyncWorkflow("it's/a-branch")).to.contain("'it''s/a-branch'");
      expect(yamlLoad(renderBitSyncWorkflow('release/main')).jobs).to.be.an('object');
    });

    it('set the action ws-dir for a workspace below the repository root, and leave it commented at the root', () => {
      const withInput = (doc: string) =>
        Object.values(yamlLoad(doc).jobs as Record<string, any>)
          .flatMap((job) => job.steps)
          .find((s: any) => String(s.uses).startsWith('teambit/bit-git-sync')).with;
      [renderBitSyncWorkflow, renderBitReleaseWorkflow].forEach((render) => {
        expect(withInput(render('main', 'packages/app'))['ws-dir']).to.equal('packages/app');
        expect(withInput(render('main', "it's dir"))['ws-dir']).to.equal("it's dir");
        expect(withInput(render('main'))).to.not.have.property('ws-dir');
        expect(render('main')).to.contain('# ws-dir: packages/my-workspace');
        expect(render('main', '.')).to.equal(render('main'));
      });
    });
  });

  describe('scaffoldWorkflowFiles', () => {
    let workspaceDir: string;

    beforeEach(() => {
      workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-scaffold-'));
    });

    afterEach(() => {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    });

    it('writes both workflow files with the default branch substituted, creating .github/workflows/', () => {
      expect(scaffoldWorkflowFiles(workspaceDir, 'develop')).to.deep.equal([
        { relativePath: WORKFLOW_RELATIVE_PATHS.sync, status: 'written' },
        { relativePath: WORKFLOW_RELATIVE_PATHS.release, status: 'written' },
      ]);
      const read = (rel: string) => fs.readFileSync(path.join(workspaceDir, rel), 'utf8');
      expect(read(WORKFLOW_RELATIVE_PATHS.sync)).to.contain("branches-ignore: ['develop', 'bit-sync/**']");
      expect(read(WORKFLOW_RELATIVE_PATHS.release)).to.contain("branches: ['develop']");
    });

    it('is idempotent: a second run skips both files rather than overwriting them', () => {
      scaffoldWorkflowFiles(workspaceDir, 'develop');
      expect(scaffoldWorkflowFiles(workspaceDir, 'develop')).to.deep.equal([
        { relativePath: WORKFLOW_RELATIVE_PATHS.sync, status: 'skipped' },
        { relativePath: WORKFLOW_RELATIVE_PATHS.release, status: 'skipped' },
      ]);
    });

    it('skips only the file that already exists, writing the other one', () => {
      const syncAbsPath = path.join(workspaceDir, WORKFLOW_RELATIVE_PATHS.sync);
      fs.mkdirSync(path.dirname(syncAbsPath), { recursive: true });
      fs.writeFileSync(syncAbsPath, 'hand-edited content, do not touch\n');
      expect(scaffoldWorkflowFiles(workspaceDir, 'develop')).to.deep.equal([
        { relativePath: WORKFLOW_RELATIVE_PATHS.sync, status: 'skipped' },
        { relativePath: WORKFLOW_RELATIVE_PATHS.release, status: 'written' },
      ]);
      expect(fs.readFileSync(syncAbsPath, 'utf8')).to.equal('hand-edited content, do not touch\n');
    });
  });

  describe('deriveOwnerRepo', () => {
    const SHOP = { owner: 'acme', repo: 'shop', host: 'github.com' };
    const REMOTES: Array<[string | undefined, OwnerRepo | undefined]> = [
      ['git@github.com:acme/shop.git', SHOP],
      ['https://github.com/acme/shop.git', SHOP],
      ['https://github.com/acme/shop', SHOP],
      ['https://gitlab.com/acme/shop.git', undefined],
      // a local/bare remote has no host at all
      ['/path/to/bare.git', undefined],
      ['file:///path/to/bare.git', undefined],
      [undefined, undefined],
    ];

    it('parses a GitHub remote in either form, and nothing else', () => {
      REMOTES.forEach(([remote, expected]) => expect(deriveOwnerRepo(remote), String(remote)).to.deep.equal(expected));
    });
  });

  describe('chooseInitDefaultBranch', () => {
    it('takes the detected branch, else main or master when checked out, else main', () => {
      expect(chooseInitDefaultBranch('trunk', 'feature/x')).to.equal('trunk');
      expect(chooseInitDefaultBranch(undefined, 'master')).to.equal('master');
      expect(chooseInitDefaultBranch(undefined, 'main')).to.equal('main');
      expect(chooseInitDefaultBranch(undefined, 'feature/x')).to.equal('main');
      expect(chooseInitDefaultBranch(undefined, undefined)).to.equal('main');
    });
  });

  describe('renderInitReport', () => {
    const files = [
      {
        relativePath: WORKFLOW_RELATIVE_PATHS.sync,
        status: 'written' as const,
        displayPath: '.github/workflows/bit-sync.yml',
      },
      {
        relativePath: WORKFLOW_RELATIVE_PATHS.release,
        status: 'written' as const,
        displayPath: '.github/workflows/bit-release.yml',
      },
    ];
    // eslint-disable-next-line no-control-regex
    const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');
    const report = (remote: string | undefined, extra: Partial<Parameters<typeof renderInitReport>[0]> = {}) =>
      plain(
        renderInitReport({
          scopeId: 'acme.shop',
          ownerRepo: deriveOwnerRepo(remote),
          defaultBranch: 'main',
          files,
          configAdded: true,
          ...extra,
        })
      );

    it('prints each step once, as commands for the derived repository', () => {
      const out = report('git@github.com:acme/shop.git');
      expect(out).to.contain('for acme.shop, mirrored to acme/shop (default branch: main)');
      expect(out).to.contain('git push -u origin HEAD');
      expect(out).to.contain('gh secret set BIT_CONFIG_ACCESS_TOKEN -R acme/shop');
      expect(out).to.contain('gh api -X PUT repos/acme/shop/actions/permissions/workflow');
      expect(out.match(/Next: 3 steps to go live/g)).to.have.length(1);
    });

    it('points github.com repositories at the GitHub App and the relay, not at a personal token', () => {
      const out = report('https://github.com/acme/shop.git');
      expect(out).to.contain('https://github.com/apps/bit-git-sync');
      expect(out).to.contain('/setup');
      expect(out).to.not.contain('/dispatches');
      expect(out).to.not.contain('Authorization: Bearer');
    });

    it('prints no placeholder commands when there is no GitHub remote yet', () => {
      const out = report(undefined);
      expect(out).to.contain('no GitHub remote yet');
      expect(out).to.contain('gh repo create --private --source . --remote origin --push');
      expect(out).to.not.contain('GITHUB_SERVER_URL');
      expect(out).to.contain('Run bit ci sync --init again');
      expect(out).to.contain('Next: 2 steps to go live');
      expect(out).to.not.contain('<owner>');
      expect(out).to.not.contain('gh secret set');
    });

    it('commits and pushes in separate commands, so a re-run with nothing to commit still pushes', () => {
      const out = report('git@github.com:acme/shop.git');
      expect(out).to.match(/git commit -m 'Mirror acme\.shop' -- \\\n\s+[^\n]+\n\s+git push -u origin HEAD/);
      expect(out).to.not.contain('&& git');
    });

    it('stages only the files --init touched, so unrelated local changes stay out of the commit', () => {
      const out = report('git@github.com:acme/shop.git');
      expect(out).to.contain(
        'git add -- .github/workflows/bit-sync.yml .github/workflows/bit-release.yml workspace.jsonc\n'
      );
      expect(out).to.not.contain('git add -A');
      // the paths are the ones shown, as seen from where the user stands
      expect(
        report('git@github.com:acme/shop.git', {
          files: files.map((f) => ({ ...f, displayPath: `/repo root/${f.displayPath}` })),
          configDisplayPath: 'workspace.jsonc',
        })
      ).to.contain("git add -- '/repo root/.github/workflows/bit-sync.yml'");
    });

    it('stages exactly the files git shows as new or changed', () => {
      const out = report('git@github.com:acme/shop.git', { toStage: ['.github/workflows/bit-sync.yml'], ignored: [] });
      expect(out).to.contain('git add -- .github/workflows/bit-sync.yml\n');
      expect(out).to.not.contain('bit-release.yml workspace.jsonc');
    });

    it('force-adds a workflow file that .gitignore matches, so the rest of the staging still runs', () => {
      const out = report('git@github.com:acme/shop.git', {
        toStage: ['workspace.jsonc'],
        ignored: ['.github/workflows/bit-release.yml'],
      });
      expect(out).to.contain('git add -- workspace.jsonc\n');
      expect(out).to.contain('git add -f -- .github/workflows/bit-release.yml\n');
      expect(out).to.contain('.gitignore matches these');
      expect(out).to.contain("git commit -m 'Mirror acme.shop'");
    });

    it('commits only the files it stages, so changes staged before stay out of the commit', () => {
      const out = report('git@github.com:acme/shop.git', {
        toStage: ['workspace.jsonc'],
        ignored: ['.github/workflows/bit-release.yml'],
      });
      expect(out).to.match(
        /git commit -m 'Mirror acme\.shop' -- \\\n\s+workspace\.jsonc \.github\/workflows\/bit-release\.yml\n/
      );
    });

    it('force-adds an ignored workflow file also for the first commit, which git add -A would skip', () => {
      const out = report(undefined, { repoHasCommits: false, ignored: ['.github/workflows/bit-sync.yml'] });
      expect(out).to.match(/git add -A\n\s+git add -f -- \.github\/workflows\/bit-sync\.yml\n/);
      // the first commit takes the whole workspace, so it names no paths
      expect(out).to.match(/git commit -m 'Mirror acme\.shop'\n/);
    });

    it('prints no commit when nothing is left to commit, and still pushes', () => {
      const out = report('git@github.com:acme/shop.git', { toStage: [], ignored: [] });
      expect(out).to.not.contain('git add');
      expect(out).to.not.contain('git commit');
      expect(out).to.contain('nothing to commit');
      expect(out).to.contain('git push -u origin HEAD');
    });

    it('starts with git init when the workspace is not in a git repository', () => {
      const out = report(undefined, { inGitRepo: false, repoHasCommits: false });
      expect(out).to.match(/git init\n\s+git add -A\n\s+git commit -m/);
      expect(report(undefined, { inGitRepo: false, repoRootFromCwd: '..' })).to.contain('git init ..\n');
      expect(report(undefined)).to.not.contain('git init');
    });

    it('stages the whole workspace for the first commit of a new repository', () => {
      expect(report(undefined, { repoHasCommits: false })).to.contain('git add -A\n');
      expect(report(undefined, { repoHasCommits: false, repoRootFromCwd: '../..' })).to.contain('git add -A :/\n');
    });

    it('shell-quotes values it puts in commands', () => {
      expect(shellQuote('main')).to.equal('main');
      expect(shellQuote('feature/x-1.2')).to.equal('feature/x-1.2');
      expect(shellQuote('$(id)')).to.equal("'$(id)'");
      expect(shellQuote("it's")).to.equal("'it'\\''s'");
      // the push names HEAD, so a branch name never reaches a command
      expect(report('git@github.com:acme/shop.git', { defaultBranch: '$(id)' })).to.contain('git push -u origin HEAD');
    });

    it('names the token-account exemption, the PR setting and the optional CI token', () => {
      const out = report('git@github.com:acme/shop.git');
      expect(out).to.contain('exempt the token');
      expect(out).to.contain('Allow GitHub Actions to create and approve pull requests');
      // one command sets both settings guide step 4 names
      expect(out).to.contain('-f default_workflow_permissions=write -F can_approve_pull_request_reviews=true');
      expect(out).to.contain('Read and write permissions');
      // the command line ends at the command, so it runs when pasted
      expect(out).to.match(/gh secret set BIT_SYNC_GH_TOKEN -R acme\/shop\n\s+optional: a GitHub token/);
    });

    it('states the schedule the scaffolded workflow installs', () => {
      expect(renderBitSyncWorkflow('main')).to.contain("cron: '*/30 * * * *'");
      expect(report('git@github.com:acme/shop.git')).to.contain('every 30 minutes');
    });

    it('names an origin it does not recognize, and says how to mark a GitHub Enterprise Server', () => {
      const origin = 'git@github.corp.example:acme/store.git';
      const out = report(origin, { originUrl: origin });
      expect(out).to.contain(`origin ${origin}`);
      expect(out).to.contain('GITHUB_SERVER_URL=https://github.corp.example bit ci sync --init');
      expect(out).to.contain('git push -u origin HEAD');
      expect(out).to.not.contain('no GitHub remote yet');
      // the host is unknown, so no github.com steps
      expect(out).to.not.contain('github.com/apps/bit-git-sync');
      expect(out).to.not.contain('gh secret set');
    });

    it('marks files that already existed and a config block that was already there', () => {
      const out = report('git@github.com:acme/shop.git', {
        files: [{ ...files[0], status: 'skipped' }, files[1]],
        configAdded: false,
      });
      expect(out).to.match(/\.github\/workflows\/bit-sync\.yml\s+already exists, left unchanged/);
      expect(out).to.match(/\.github\/workflows\/bit-release\.yml\s+releases the scope/);
      expect(out).to.match(/workspace\.jsonc\s+already configures sync/);
    });

    it('creates the repository from the repository root when the workspace is a subdirectory', () => {
      expect(report(undefined, { repoRootFromCwd: '../..' })).to.contain(
        'gh repo create --private --source ../.. --remote origin --push'
      );
      expect(report(undefined, { repoRootFromCwd: '/my repo' })).to.contain("--source '/my repo' --remote");
    });

    it('flags a guessed default branch', () => {
      const origin = 'git@github.com:acme/shop.git';
      expect(report(origin, { originUrl: origin, defaultBranchGuessed: true })).to.contain(
        "the remote didn't name its default branch"
      );
      expect(report(undefined, { defaultBranchGuessed: true })).to.contain('no remote names the default branch');
      expect(report(origin)).to.not.contain('default branch, so');
    });

    it('suggests no server for an origin that is a path on this machine', () => {
      [
        '/tmp/e2e/remote.git',
        '../remote.git',
        'remote.git',
        'repos/remote.git',
        'file:///srv/remote.git',
        'C:\\repos\\remote.git',
      ].forEach((origin) => {
        expect(isLocalPathRemote(origin), origin).to.be.true;
        const out = report(origin, { originUrl: origin });
        expect(out, origin).to.contain(`origin ${origin}`);
        expect(out, origin).to.not.contain('GITHUB_SERVER_URL');
        expect(out, origin).to.not.contain('<your-server>');
        expect(out, origin).to.contain('git push -u origin HEAD');
      });
      expect(isLocalPathRemote('git@ghe.example:acme/store.git')).to.be.false;
      expect(isLocalPathRemote('https://ghe.example/acme/store.git')).to.be.false;
      expect(isLocalPathRemote('ssh://git@ghe.example:2222/acme/store.git')).to.be.false;
      expect(isLocalPathRemote('ghe.example:acme/store.git')).to.be.false;
    });

    it('prints control characters in an origin as inert text, and suggests no server for it', () => {
      expect(escapeControlChars('a\nb\u001b[2Jc')).to.equal('a\\x0ab\\x1b[2Jc');
      const origin = 'https://ghe.example/acme/store.git\n\u001b[32m✔ all set';
      const out = renderInitReport({
        scopeId: 'acme.shop',
        originUrl: origin,
        defaultBranch: 'main',
        files,
        configAdded: true,
      });
      expect(out).to.not.contain('\u001b[32m');
      expect(out).to.not.contain('store.git\n');
      expect(out).to.contain('origin https://ghe.example/acme/store.git\\x0a\\x1b[32m');
      expect(out).to.not.contain('GITHUB_SERVER_URL');
    });

    it('never prints the credentials an origin URL carries', () => {
      expect(redactRemoteUrl('https://user:ghp_secret@git.corp.example/acme/store.git')).to.equal(
        'https://git.corp.example/acme/store.git'
      );
      expect(redactRemoteUrl('https://ghp_secret@git.corp.example/acme/store.git')).to.equal(
        'https://git.corp.example/acme/store.git'
      );
      expect(redactRemoteUrl('ssh://git:secret@git.corp.example/acme/store.git')).to.equal(
        'ssh://git@git.corp.example/acme/store.git'
      );
      expect(redactRemoteUrl('ssh://git@git.corp.example/acme/store.git')).to.equal(
        'ssh://git@git.corp.example/acme/store.git'
      );
      expect(redactRemoteUrl('git@git.corp.example:acme/store.git')).to.equal('git@git.corp.example:acme/store.git');
      const origin = 'https://user:ghp_secret@git.corp.example:8443/acme/store.git';
      const out = report(origin, { originUrl: origin });
      expect(out).to.not.contain('ghp_secret');
      expect(out).to.contain('origin https://git.corp.example:8443/acme/store.git');
      expect(out).to.contain('GITHUB_SERVER_URL=https://git.corp.example:8443 bit ci sync --init');
    });

    it('suggests a GITHUB_SERVER_URL that keeps an https port, and drops an ssh one', () => {
      expect(suggestedServerUrl('https://ghe.example:8443/acme/store.git')).to.equal('https://ghe.example:8443');
      expect(suggestedServerUrl('git@ghe.example:acme/store.git')).to.equal('https://ghe.example');
      expect(suggestedServerUrl('ssh://git@ghe.example:2222/acme/store.git')).to.equal('https://ghe.example');
      const origin = 'https://ghe.example:8443/acme/store.git';
      expect(report(origin, { originUrl: origin })).to.contain(
        'GITHUB_SERVER_URL=https://ghe.example:8443 bit ci sync --init'
      );
    });

    describe('on GitHub Enterprise Server', () => {
      const saved: Record<string, string | undefined> = {};
      beforeEach(() => {
        saved.api = process.env.GITHUB_API_URL;
        saved.server = process.env.GITHUB_SERVER_URL;
        process.env.GITHUB_SERVER_URL = 'https://ghe.corp.example';
      });
      afterEach(() => {
        if (saved.api === undefined) delete process.env.GITHUB_API_URL;
        else process.env.GITHUB_API_URL = saved.api;
        if (saved.server === undefined) delete process.env.GITHUB_SERVER_URL;
        else process.env.GITHUB_SERVER_URL = saved.server;
      });

      it('uses the dispatch webhook on the server API, and gh commands that name the host', () => {
        process.env.GITHUB_API_URL = 'https://ghe.corp.example/api/v3';
        const out = report('git@ghe.corp.example:acme/store.git');
        expect(out).to.contain('https://ghe.corp.example/api/v3/repos/acme/store/dispatches');
        expect(out).to.contain('"event_type":"bit-export"');
        expect(out).to.contain('gh secret set BIT_CONFIG_ACCESS_TOKEN -R ghe.corp.example/acme/store');
        expect(out).to.contain('gh api --hostname ghe.corp.example -X PUT repos/acme/store/');
        expect(out).to.not.contain('github.com/apps/bit-git-sync');
      });

      it('derives <server>/api/v3 when GITHUB_API_URL is unset', () => {
        delete process.env.GITHUB_API_URL;
        expect(report('https://ghe.corp.example/acme/store.git')).to.contain(
          'https://ghe.corp.example/api/v3/repos/acme/store/dispatches'
        );
      });

      it('names no API when GITHUB_API_URL is on another host', () => {
        process.env.GITHUB_API_URL = 'https://api.github.com';
        const out = report('https://ghe.corp.example/acme/store.git');
        expect(out).to.contain('<GitHub API URL>/repos/acme/store/dispatches');
        expect(out).to.contain('GITHUB_API_URL "https://api.github.com"');
        expect(out).to.not.contain('https://api.github.com/repos');
      });

      it('keeps the App path for a github.com origin', () => {
        process.env.GITHUB_API_URL = 'https://ghe.corp.example/api/v3';
        const out = report('git@github.com:acme/shop.git');
        expect(out).to.contain('https://github.com/apps/bit-git-sync');
        expect(out).to.not.contain('ghe.corp.example');
      });
    });
  });
});
