import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AGENTS_MD_RELATIVE_PATH,
  AGENTS_SECTION_START,
  UNKNOWN_REPO,
  fillInRepo,
  insertAgentsSection,
  renderAgentsSection,
  scaffoldAgentsMd,
} from './agents-md';
import { renderInitReport } from './init-scaffold';

const VALUES = { scope: 'acme.billing', repo: 'acme/billing', defaultBranch: 'trunk' };
const SECTION = '<!-- bit-ci-sync:start -->\n\n## Sync\n\nrules\n\n<!-- bit-ci-sync:end -->\n';

describe('agents-md', () => {
  describe('renderAgentsSection', () => {
    it('fills in every placeholder', () => {
      const rendered = renderAgentsSection(VALUES);
      expect(rendered).to.not.include('{{');
      expect(rendered).to.include('this repository mirrors `acme.billing`');
      expect(rendered).to.include('gh pr list -R acme/billing --head <lane-name>');
      expect(rendered).to.include('Never push to `trunk`');
      expect(rendered).to.not.include('`main` equals');
    });

    it('inserts a branch name with `$` in it verbatim', () => {
      const rendered = renderAgentsSection({ ...VALUES, defaultBranch: "a$'b$&" });
      expect(rendered).to.include("Never push to `a$'b$&`");
    });

    it('opens and closes with the markers', () => {
      const rendered = renderAgentsSection(VALUES).trim();
      expect(rendered.startsWith(AGENTS_SECTION_START)).to.equal(true);
      expect(rendered.endsWith('<!-- bit-ci-sync:end -->')).to.equal(true);
    });
  });

  describe('insertAgentsSection', () => {
    it('goes after the title and the paragraph under it', () => {
      const existing = '# Bit Workspace\n\nThis file teaches agents.\nRead it fully.\n\n## What is Bit?\n\nBit is…\n';
      expect(insertAgentsSection(existing, SECTION)).to.equal(
        `# Bit Workspace\n\nThis file teaches agents.\nRead it fully.\n\n${SECTION.trim()}\n\n---\n\n## What is Bit?\n\nBit is…\n`
      );
    });

    it('goes right after the title when a heading follows it', () => {
      const existing = '# Title\n\n## First\n\ntext\n';
      expect(insertAgentsSection(existing, SECTION)).to.equal(
        `# Title\n\n${SECTION.trim()}\n\n---\n\n## First\n\ntext\n`
      );
    });

    it('goes before a numbered list under the title', () => {
      const existing = '# Rules\n\n1. Always submit a change request.\n2. Tag on main.\n';
      expect(insertAgentsSection(existing, SECTION)).to.equal(
        `# Rules\n\n${SECTION.trim()}\n\n---\n\n1. Always submit a change request.\n2. Tag on main.\n`
      );
    });

    it('goes before a list that follows the intro paragraph with no blank line', () => {
      const existing = '# Rules\n\nFollow these:\n1) Submit a change request.\n+ Tag on main.\n';
      expect(insertAgentsSection(existing, SECTION)).to.equal(
        `# Rules\n\nFollow these:\n\n${SECTION.trim()}\n\n---\n\n1) Submit a change request.\n+ Tag on main.\n`
      );
    });

    it('goes at the top of a file with no title', () => {
      const existing = '## Rules\n\n- one\n';
      expect(insertAgentsSection(existing, SECTION)).to.equal(`${SECTION.trim()}\n\n---\n\n## Rules\n\n- one\n`);
    });

    it('keeps front matter first', () => {
      const existing = '---\nalwaysApply: true\n---\n\n# Title\n\nIntro.\n';
      expect(insertAgentsSection(existing, SECTION)).to.equal(
        `---\nalwaysApply: true\n---\n\n# Title\n\nIntro.\n\n${SECTION.trim()}\n`
      );
    });

    it('fills an empty file', () => {
      expect(insertAgentsSection('', SECTION)).to.equal(`${SECTION.trim()}\n`);
    });
  });

  describe('fillInRepo', () => {
    const doc = `before ${UNKNOWN_REPO}\n${AGENTS_SECTION_START} -->\nrun -R ${UNKNOWN_REPO}\n<!-- bit-ci-sync:end -->\nafter ${UNKNOWN_REPO}\n`;

    it('replaces the placeholder inside the section only', () => {
      expect(fillInRepo(doc, 'acme/billing')).to.equal(
        `before ${UNKNOWN_REPO}\n${AGENTS_SECTION_START} -->\nrun -R acme/billing\n<!-- bit-ci-sync:end -->\nafter ${UNKNOWN_REPO}\n`
      );
    });

    it('changes nothing while the repository is still unknown', () => {
      expect(fillInRepo(doc, UNKNOWN_REPO)).to.equal(doc);
    });
  });

  describe('scaffoldAgentsMd', () => {
    let workspaceDir: string;
    const agentsPath = () => path.join(workspaceDir, AGENTS_MD_RELATIVE_PATH);

    beforeEach(() => {
      workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-'));
    });
    afterEach(() => {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    });

    it('creates AGENTS.md when there is none', () => {
      expect(scaffoldAgentsMd(workspaceDir, VALUES)).to.deep.equal({
        relativePath: AGENTS_MD_RELATIVE_PATH,
        status: 'written',
      });
      const written = fs.readFileSync(agentsPath(), 'utf8');
      expect(written.startsWith('# Agent instructions\n\n<!-- bit-ci-sync:start')).to.equal(true);
    });

    it('adds the section to the top of an existing AGENTS.md and keeps the rest', () => {
      fs.writeFileSync(
        agentsPath(),
        '# Bit Workspace\n\nIntro.\n\n## Saving and Publishing Changes\n\nsubmit a change request\n'
      );
      expect(scaffoldAgentsMd(workspaceDir, VALUES).status).to.equal('updated');
      const updated = fs.readFileSync(agentsPath(), 'utf8');
      expect(updated.indexOf(AGENTS_SECTION_START)).to.be.lessThan(updated.indexOf('## Saving and Publishing'));
      expect(updated).to.include('submit a change request');
    });

    it('fills in the repository on a re-run once origin is known, and changes nothing else', () => {
      scaffoldAgentsMd(workspaceDir, { ...VALUES, repo: UNKNOWN_REPO });
      const first = fs.readFileSync(agentsPath(), 'utf8');
      expect(first).to.include(`gh pr list -R ${UNKNOWN_REPO}`);
      expect(scaffoldAgentsMd(workspaceDir, VALUES)).to.deep.equal({
        relativePath: AGENTS_MD_RELATIVE_PATH,
        status: 'updated',
        note: 'filled in the repository in the sync rules',
      });
      const second = fs.readFileSync(agentsPath(), 'utf8');
      expect(second).to.not.include(UNKNOWN_REPO);
      expect(second).to.include('gh pr list -R acme/billing --head <lane-name>');
      // the examples for other repositories keep their placeholder
      expect(second).to.include('gh repo create <org>/<repo>');
      expect(second.split(UNKNOWN_REPO).join('acme/billing')).to.equal(first.split(UNKNOWN_REPO).join('acme/billing'));
      expect(scaffoldAgentsMd(workspaceDir, VALUES).status).to.equal('skipped');
    });

    it('leaves a file that already has the section unchanged on a re-run', () => {
      scaffoldAgentsMd(workspaceDir, VALUES);
      const edited = `${fs.readFileSync(agentsPath(), 'utf8')}\nhand edit\n`;
      fs.writeFileSync(agentsPath(), edited);
      expect(scaffoldAgentsMd(workspaceDir, { ...VALUES, scope: 'other.scope' }).status).to.equal('skipped');
      expect(fs.readFileSync(agentsPath(), 'utf8')).to.equal(edited);
    });
  });

  describe('in the init report', () => {
    const report = (status: 'written' | 'updated' | 'skipped', note?: string) =>
      renderInitReport({
        scopeId: 'acme.billing',
        ownerRepo: { owner: 'acme', repo: 'billing', host: 'github.com' },
        defaultBranch: 'main',
        files: [{ relativePath: AGENTS_MD_RELATIVE_PATH, status, note, displayPath: 'AGENTS.md' }],
        configAdded: true,
      });

    it('says what each outcome did', () => {
      expect(report('written')).to.include('tells coding agents how the sync works in this repository');
      expect(report('updated')).to.include('added the sync rules at the top');
      expect(report('skipped')).to.include('already has the sync rules, left unchanged');
      expect(report('updated', 'filled in the repository in the sync rules')).to.include(
        'filled in the repository in the sync rules'
      );
    });

    it('stages AGENTS.md with the other files', () => {
      expect(report('written')).to.match(/git add -- .*AGENTS\.md/);
    });
  });
});
