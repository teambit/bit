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
      expect(out).to.contain('git push -u origin main');
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
      expect(out).to.contain('Run bit ci sync --init again');
      expect(out).to.contain('Next: 2 steps to go live');
      expect(out).to.not.contain('<owner>');
      expect(out).to.not.contain('gh secret set');
    });

    it('commits and pushes in separate commands, so a re-run with nothing to commit still pushes', () => {
      const out = report('git@github.com:acme/shop.git');
      expect(out).to.match(/git add -A && git commit -m 'Mirror acme\.shop'\n\s+git push -u origin main/);
      expect(out).to.not.contain('&& git push');
    });

    it('shell-quotes values it puts in commands', () => {
      expect(shellQuote('main')).to.equal('main');
      expect(shellQuote('feature/x-1.2')).to.equal('feature/x-1.2');
      expect(shellQuote('$(id)')).to.equal("'$(id)'");
      expect(shellQuote("it's")).to.equal("'it'\\''s'");
      expect(report('git@github.com:acme/shop.git', { defaultBranch: '$(id)' })).to.contain(
        "git push -u origin '$(id)'"
      );
    });

    it('names the token-account exemption, the PR setting and the optional CI token', () => {
      const out = report('git@github.com:acme/shop.git');
      expect(out).to.contain('exempt the token');
      expect(out).to.contain('Allow GitHub Actions to create and approve pull requests');
      expect(out).to.contain('gh secret set BIT_SYNC_GH_TOKEN -R acme/shop');
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
      expect(out).to.contain('git push -u origin main');
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
