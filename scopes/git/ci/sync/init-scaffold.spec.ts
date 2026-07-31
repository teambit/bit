import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { load as yamlLoad } from 'js-yaml';
import {
  WORKFLOW_RELATIVE_PATHS,
  renderBitSyncWorkflow,
  renderBitReleaseWorkflow,
  scaffoldWorkflowFiles,
  deriveOwnerRepo,
  renderInitChecklist,
} from './init-scaffold';

describe('init-scaffold', () => {
  // ---------------------------------------------------------------------------------------------
  // template substitution — the pure part `bit ci sync --init` is built on
  // ---------------------------------------------------------------------------------------------
  describe('renderBitSyncWorkflow', () => {
    it('substitutes the detected default branch into the push branches-ignore list', () => {
      const rendered = renderBitSyncWorkflow('develop');
      expect(rendered).to.contain("branches-ignore: ['develop', 'bit-sync/**']");
      expect(rendered).to.not.contain('branches-ignore: [main,');
    });

    it('is a no-op substitution when the default branch really is "main"', () => {
      // The common case: substituting "main" for "main" must not corrupt anything else in the file.
      const rendered = renderBitSyncWorkflow('main');
      expect(rendered).to.contain("branches-ignore: ['main', 'bit-sync/**']");
    });

    it('leaves the mainSyncBranch default ("bit-sync/main") untouched regardless of the default branch', () => {
      const rendered = renderBitSyncWorkflow('develop');
      expect(rendered).to.contain('main-sync-branch: bit-sync/main');
    });

    it('leaves unrelated identifiers containing "main" untouched (bit-main-export, main-export)', () => {
      // A blanket `\bmain\b` replace would also hit these — the substitution must be exact-substring,
      // not a word-boundary regex, or the dispatch types and their doc comment would be corrupted.
      const rendered = renderBitSyncWorkflow('develop');
      expect(rendered).to.contain('bit-main-export');
      expect(rendered).to.contain('main export)'); // the comment describing the alias
    });

    it('keeps the `uses:` action ref as the CHANGE-ME placeholder, untouched', () => {
      const rendered = renderBitSyncWorkflow('develop');
      expect(rendered).to.contain('uses: luvktest/bit-git-sync@v1');
      expect(rendered).to.contain('CHANGE-ME');
    });

    it('preserves the GitHub Actions expression syntax (${{ ... }}) verbatim', () => {
      const rendered = renderBitSyncWorkflow('develop');
      expect(rendered).to.contain('${{ secrets.BIT_CONFIG_ACCESS_TOKEN }}');
    });

    it('accepts a slashed default branch name (e.g. a release/x convention)', () => {
      const rendered = renderBitSyncWorkflow('release/2026');
      expect(rendered).to.contain("branches-ignore: ['release/2026', 'bit-sync/**']");
    });
  });

  describe('renderBitReleaseWorkflow', () => {
    it('substitutes the detected default branch into the pull_request branches filter', () => {
      const rendered = renderBitReleaseWorkflow('develop');
      expect(rendered).to.contain("branches: ['develop']");
      expect(rendered).to.not.contain('branches: [main]');
    });

    it('leaves the mainSyncBranch check untouched', () => {
      const rendered = renderBitReleaseWorkflow('develop');
      expect(rendered).to.contain("github.event.pull_request.head.ref != 'bit-sync/main'");
      expect(rendered).to.contain('main-sync-branch: bit-sync/main');
    });

    it('is a no-op substitution when the default branch really is "main"', () => {
      const rendered = renderBitReleaseWorkflow('main');
      expect(rendered).to.contain("branches: ['main']");
    });
  });

  // ---------------------------------------------------------------------------------------------
  // THE EMITTED YAML IS PARSED, not substring-matched.
  //
  // Every assertion above is `to.contain` on a rendered string, which cannot tell a valid workflow from
  // a broken one — the substitution point sits inside a YAML **flow sequence** (`[a, b]`), where `,` and
  // `]` are structural, and a substring match is blind to exactly the damage an unquoted value does.
  //
  // Branch names can contain both characters: git's `check-ref-format` forbids a specific list (space,
  // `~^:?*[\`, `..`, `@{`, trailing `.`/`.lock`) and `validateBranchName` deliberately mirrors it rather
  // than inventing a stricter grammar, so `a,b]c` is a name this command can be pointed at. Unquoted,
  // `branches: [a,b]c]` parses as a DIFFERENT two-element sequence with trailing garbage — a scaffolded
  // workflow that watches the wrong branches, or does not load at all.
  //
  // Parsed with `js-yaml`, which is what makes these rows able to catch that: it is already a dependency
  // used by several e2e suites in this repo, and GitHub Actions itself consumes these files as YAML, so
  // "does a YAML parser agree" is the property that actually matters.
  // ---------------------------------------------------------------------------------------------
  describe('the rendered workflows are valid YAML with the branch as one list element', () => {
    /** `on:` — quoted here because YAML 1.1 parsers read a bare `on` key as the boolean `true`. */
    function onSection(rendered: string): any {
      const doc = yamlLoad(rendered) as any;
      // js-yaml (YAML 1.1 core schema) resolves the plain scalar key `on` to `true`, so accept either.
      return doc.on ?? doc[true as any];
    }

    it('parses at all, for both templates and an ordinary branch name', () => {
      expect(() => yamlLoad(renderBitSyncWorkflow('main'))).to.not.throw();
      expect(() => yamlLoad(renderBitReleaseWorkflow('main'))).to.not.throw();
    });

    it('puts a slashed branch name in as exactly one element of branches-ignore', () => {
      const on = onSection(renderBitSyncWorkflow('release/main'));
      expect(on.push['branches-ignore']).to.deep.equal(['release/main', 'bit-sync/**']);
    });

    it('puts a slashed branch name in as exactly one element of the pull_request branches filter', () => {
      const on = onSection(renderBitReleaseWorkflow('release/main'));
      expect(on.pull_request.branches).to.deep.equal(['release/main']);
    });

    /**
     * THE REGRESSION. Unquoted, this rendered `branches-ignore: [a,b]c, 'bit-sync/**']` — which is not
     * the intended sequence and is not even the same shape.
     */
    it('survives a branch name containing a comma and a closing bracket', () => {
      const hostile = 'a,b]c';
      const on = onSection(renderBitSyncWorkflow(hostile));
      expect(on.push['branches-ignore']).to.deep.equal([hostile, 'bit-sync/**']);

      const releaseOn = onSection(renderBitReleaseWorkflow(hostile));
      expect(releaseOn.pull_request.branches).to.deep.equal([hostile]);
    });

    /** A single quote is the one character the quoting style itself has to escape, by doubling it. */
    it('survives a branch name containing a single quote', () => {
      const hostile = "it's/a-branch";
      expect(renderBitSyncWorkflow(hostile)).to.contain("'it''s/a-branch'");
      const on = onSection(renderBitSyncWorkflow(hostile));
      expect(on.push['branches-ignore']).to.deep.equal([hostile, 'bit-sync/**']);
    });

    /**
     * `$` is git-legal, and `$&` / `$'` / `` $` `` / `$$` are all special inside a **string** replacement
     * passed to `String.replace` — `$'` splices in the text following the match. The substitution uses
     * function replacements precisely so these arrive verbatim.
     */
    it('survives a branch name containing String.replace substitution patterns', () => {
      for (const hostile of ["a$'b", 'a$&b', 'a$$b', 'a$`b']) {
        const on = onSection(renderBitSyncWorkflow(hostile));
        expect(on.push['branches-ignore'], `branch ${hostile}`).to.deep.equal([hostile, 'bit-sync/**']);
      }
    });

    it('keeps the rest of the workflow intact — the quoting touches one value, not the document', () => {
      const doc = yamlLoad(renderBitSyncWorkflow('release/main')) as any;
      expect(doc.jobs).to.be.an('object');
      // the mainSyncBranch default is a different `main` and must survive verbatim
      expect(renderBitSyncWorkflow('release/main')).to.contain('main-sync-branch: bit-sync/main');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // file writing — never overwrites, creates .github/workflows as needed
  // ---------------------------------------------------------------------------------------------
  describe('scaffoldWorkflowFiles', () => {
    let workspaceDir: string;

    beforeEach(() => {
      workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-scaffold-'));
    });

    afterEach(() => {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    });

    it('writes both workflow files with the default branch substituted, creating .github/workflows/', () => {
      const outcomes = scaffoldWorkflowFiles(workspaceDir, 'develop');
      expect(outcomes).to.deep.equal([
        { relativePath: WORKFLOW_RELATIVE_PATHS.sync, status: 'written' },
        { relativePath: WORKFLOW_RELATIVE_PATHS.release, status: 'written' },
      ]);
      const syncContent = fs.readFileSync(path.join(workspaceDir, WORKFLOW_RELATIVE_PATHS.sync), 'utf8');
      const releaseContent = fs.readFileSync(path.join(workspaceDir, WORKFLOW_RELATIVE_PATHS.release), 'utf8');
      expect(syncContent).to.contain("branches-ignore: ['develop', 'bit-sync/**']");
      expect(releaseContent).to.contain("branches: ['develop']");
    });

    it('is idempotent: a second run skips both files rather than overwriting them', () => {
      scaffoldWorkflowFiles(workspaceDir, 'develop');
      const secondRun = scaffoldWorkflowFiles(workspaceDir, 'develop');
      expect(secondRun).to.deep.equal([
        { relativePath: WORKFLOW_RELATIVE_PATHS.sync, status: 'skipped' },
        { relativePath: WORKFLOW_RELATIVE_PATHS.release, status: 'skipped' },
      ]);
    });

    it('skips only the file that already exists, writing the other one', () => {
      const syncAbsPath = path.join(workspaceDir, WORKFLOW_RELATIVE_PATHS.sync);
      fs.mkdirSync(path.dirname(syncAbsPath), { recursive: true });
      fs.writeFileSync(syncAbsPath, 'hand-edited content, do not touch\n');

      const outcomes = scaffoldWorkflowFiles(workspaceDir, 'develop');
      expect(outcomes).to.deep.equal([
        { relativePath: WORKFLOW_RELATIVE_PATHS.sync, status: 'skipped' },
        { relativePath: WORKFLOW_RELATIVE_PATHS.release, status: 'written' },
      ]);
      // and the hand-edited file must be untouched
      expect(fs.readFileSync(syncAbsPath, 'utf8')).to.equal('hand-edited content, do not touch\n');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // owner/repo derivation for the checklist's webhook URL
  // ---------------------------------------------------------------------------------------------
  describe('deriveOwnerRepo', () => {
    it('parses an ssh-form GitHub remote', () => {
      expect(deriveOwnerRepo('git@github.com:acme/shop.git')).to.deep.equal({ owner: 'acme', repo: 'shop' });
    });

    it('parses an https-form GitHub remote', () => {
      expect(deriveOwnerRepo('https://github.com/acme/shop.git')).to.deep.equal({ owner: 'acme', repo: 'shop' });
      expect(deriveOwnerRepo('https://github.com/acme/shop')).to.deep.equal({ owner: 'acme', repo: 'shop' });
    });

    it('returns undefined for a non-GitHub remote', () => {
      expect(deriveOwnerRepo('https://gitlab.com/acme/shop.git')).to.equal(undefined);
    });

    it('returns undefined for a local/bare remote (no host at all)', () => {
      expect(deriveOwnerRepo('/path/to/bare.git')).to.equal(undefined);
      expect(deriveOwnerRepo('file:///path/to/bare.git')).to.equal(undefined);
    });

    it('returns undefined when there is no remote url', () => {
      expect(deriveOwnerRepo(undefined)).to.equal(undefined);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // checklist rendering — owner/repo present vs. absent
  // ---------------------------------------------------------------------------------------------
  describe('renderInitChecklist', () => {
    it('renders a real dispatch URL when owner/repo were derived', () => {
      const checklist = renderInitChecklist({ owner: 'acme', repo: 'shop' });
      expect(checklist).to.contain('https://api.github.com/repos/acme/shop/dispatches');
      expect(checklist).to.not.contain('<owner>/<repo>');
    });

    it('falls back to an <owner>/<repo> placeholder when they could not be derived', () => {
      const checklist = renderInitChecklist(undefined);
      expect(checklist).to.contain('https://api.github.com/repos/<owner>/<repo>/dispatches');
    });

    it('always includes the secrets, permissions, webhook and fetch-depth checklist items', () => {
      const checklist = renderInitChecklist(undefined);
      expect(checklist).to.contain('BIT_CONFIG_ACCESS_TOKEN');
      expect(checklist).to.contain('BIT_SYNC_GH_TOKEN');
      expect(checklist).to.contain('contents: write');
      expect(checklist).to.contain('Components > Export');
      expect(checklist).to.contain('Authorization: Bearer <PAT>');
      expect(checklist).to.contain('Accept: application/vnd.github+json');
      expect(checklist).to.contain('"event_type":"bit-export"');
      expect(checklist).to.contain('{{laneId}}');
      expect(checklist).to.contain('drops its custom headers');
      expect(checklist).to.contain('fetch-depth: 0');
    });
  });
});
