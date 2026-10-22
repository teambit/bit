import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AGENTS_MD_RELATIVE_PATH,
  AGENTS_SECTION_START,
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

    it('leaves a file that already has the section unchanged on a re-run', () => {
      scaffoldAgentsMd(workspaceDir, VALUES);
      const edited = `${fs.readFileSync(agentsPath(), 'utf8')}\nhand edit\n`;
      fs.writeFileSync(agentsPath(), edited);
      expect(scaffoldAgentsMd(workspaceDir, { ...VALUES, scope: 'other.scope' }).status).to.equal('skipped');
      expect(fs.readFileSync(agentsPath(), 'utf8')).to.equal(edited);
    });
  });

  describe('in the init report', () => {
    const report = (status: 'written' | 'updated' | 'skipped') =>
      renderInitReport({
        scopeId: 'acme.billing',
        ownerRepo: { owner: 'acme', repo: 'billing', host: 'github.com' },
        defaultBranch: 'main',
        files: [{ relativePath: AGENTS_MD_RELATIVE_PATH, status, displayPath: 'AGENTS.md' }],
        configAdded: true,
      });

    it('says what each outcome did', () => {
      expect(report('written')).to.include('tells coding agents how the sync works in this repository');
      expect(report('updated')).to.include('added the sync rules at the top');
      expect(report('skipped')).to.include('already has the sync rules, left unchanged');
    });

    it('stages AGENTS.md with the other files', () => {
      expect(report('written')).to.match(/git add -- .*AGENTS\.md/);
    });
  });
});
