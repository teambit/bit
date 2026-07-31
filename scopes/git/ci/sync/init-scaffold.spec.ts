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
  renderInitChecklist,
} from './init-scaffold';

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
    const REMOTES: Array<[string | undefined, { owner: string; repo: string } | undefined]> = [
      ['git@github.com:acme/shop.git', { owner: 'acme', repo: 'shop' }],
      ['https://github.com/acme/shop.git', { owner: 'acme', repo: 'shop' }],
      ['https://github.com/acme/shop', { owner: 'acme', repo: 'shop' }],
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

  describe('renderInitChecklist', () => {
    it('renders a real dispatch URL when owner/repo were derived, a placeholder when not', () => {
      const derived = renderInitChecklist({ owner: 'acme', repo: 'shop' });
      expect(derived).to.contain('https://api.github.com/repos/acme/shop/dispatches');
      expect(derived).to.not.contain('<owner>/<repo>');
      expect(renderInitChecklist(undefined)).to.contain('https://api.github.com/repos/<owner>/<repo>/dispatches');
    });

    it('always includes the secrets, permissions, webhook and fetch-depth checklist items', () => {
      const checklist = renderInitChecklist(undefined);
      [
        'BIT_CONFIG_ACCESS_TOKEN',
        'BIT_SYNC_GH_TOKEN',
        'contents: write',
        'Components > Export',
        'Authorization: Bearer <PAT>',
        'Accept: application/vnd.github+json',
        '"event_type":"bit-export"',
        '{{laneId}}',
        'drops its custom headers',
        'fetch-depth: 0',
      ].forEach((item) => expect(checklist, item).to.contain(item));
    });
  });
});
