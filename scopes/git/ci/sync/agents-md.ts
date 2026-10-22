import fs from 'fs';
import path from 'path';
import type { ScaffoldFileOutcome } from './init-scaffold';

/**
 * `bit ci sync --init` writes the sync rules for coding agents into AGENTS.md. Agents that work in a
 * mirror must know that review happens on the pull request, that the workflows own the default branch,
 * and how a lane and a branch map to each other. The generic Bit instructions say otherwise (a bit.cloud
 * change request, `bit tag` on main), so the section goes at the top and says that it wins.
 *
 * TEMPLATE SOURCE OF TRUTH: `agents-sync-section.md`, next to this file. The reference repository
 * teambit/acme-modular-store carries the same section, rendered for its scope.
 */

/** Where `--init` writes the agent instructions, relative to the workspace root. */
export const AGENTS_MD_RELATIVE_PATH = 'AGENTS.md';

/** The marker that opens the section. Its presence means the section is there: a re-run leaves the file alone. */
export const AGENTS_SECTION_START = '<!-- bit-ci-sync:start';

/** The marker that closes the section. */
export const AGENTS_SECTION_END = '<!-- bit-ci-sync:end -->';

/**
 * The repository value when `--init` runs before origin is a GitHub remote. It differs from the
 * `<org>/<repo>` examples in the section, so a later run can fill in this one and leave those alone.
 */
export const UNKNOWN_REPO = '<org>/<this-repo>';

/** The title of an AGENTS.md that `--init` creates. */
const NEW_FILE_TITLE = '# Agent instructions';

export interface AgentsSectionValues {
  /** the scope this repository mirrors, e.g. `acme.billing` */
  scope: string;
  /** the repository as `gh -R` takes it: `owner/repo`, or `host/owner/repo` on GitHub Enterprise Server */
  repo: string;
  /** the repository's default branch, the one the workflows own */
  defaultBranch: string;
}

/** The sync section, with the scope, the repository and the default branch filled in. */
export function renderAgentsSection(values: AgentsSectionValues): string {
  const raw = fs.readFileSync(path.join(__dirname, 'agents-sync-section.md'), 'utf8');
  const byKey: Record<string, string> = { scope: values.scope, repo: values.repo, branch: values.defaultBranch };
  // A function replacement inserts the value verbatim: `$` is legal in a branch name.
  return raw.replace(/\{\{(scope|repo|branch)\}\}/g, (_match, key: string) => byKey[key]);
}

/**
 * Does `line` open a Markdown block other than a paragraph: a heading, a rule, a fence, a comment, a
 * table, a quote, or a bulleted or numbered list item?
 */
function startsBlock(line: string): boolean {
  return /^\s*(#|---|```|~~~|<!--|\||>|[-*+](\s|$)|\d+[.)](\s|$))/.test(line);
}

/**
 * `existing` with `section` placed after its title and the paragraph under the title, and before
 * everything else. Front matter stays first. A file with no title gets the section at the top.
 */
export function insertAgentsSection(existing: string, section: string): string {
  const lines = existing.split('\n');
  let at = 0;
  if (lines[0]?.trim() === '---') {
    // YAML closes a document with `---` or `...`.
    const end = lines.findIndex((line, i) => i > 0 && (line.trim() === '---' || line.trim() === '...'));
    if (end > 0) at = end + 1;
  }
  let next = at;
  while (next < lines.length && !lines[next].trim()) next++;
  if (next < lines.length && lines[next].startsWith('# ')) {
    next++;
    while (next < lines.length && !lines[next].trim()) next++;
    // The paragraph under the title introduces the file; it stays with the title. A list, a heading or
    // another block is content: the section goes before it, so the rules come first.
    if (next < lines.length && !startsBlock(lines[next])) {
      next++;
      while (next < lines.length && lines[next].trim() && !startsBlock(lines[next])) next++;
    }
    at = next;
  }
  const before = lines.slice(0, at).join('\n').trimEnd();
  const after = lines.slice(at).join('\n').trim();
  const parts = [before, section.trim(), ...(after ? ['---', after] : [])].filter(Boolean);
  return `${parts.join('\n\n')}\n`;
}

/**
 * Write the sync section into `<workspaceDir>/AGENTS.md`. A missing file is created, an existing file
 * gets the section at the top, and a file that already has it is left unchanged, hand edits included.
 * One exception: a section written before the repository was known gets the repository filled in.
 */
export function scaffoldAgentsMd(workspaceDir: string, values: AgentsSectionValues): ScaffoldFileOutcome {
  const relativePath = AGENTS_MD_RELATIVE_PATH;
  const absPath = path.join(workspaceDir, relativePath);
  const section = renderAgentsSection(values);
  if (!fs.existsSync(absPath)) {
    fs.writeFileSync(absPath, `${NEW_FILE_TITLE}\n\n${section.trim()}\n`);
    return { relativePath, status: 'written' };
  }
  const existing = fs.readFileSync(absPath, 'utf8');
  if (existing.includes(AGENTS_SECTION_START)) {
    const filled = fillInRepo(existing, values.repo);
    if (filled === existing) return { relativePath, status: 'skipped' };
    fs.writeFileSync(absPath, filled);
    return { relativePath, status: 'updated', note: 'filled in the repository in the sync rules' };
  }
  fs.writeFileSync(absPath, insertAgentsSection(existing, section));
  return { relativePath, status: 'updated' };
}

/**
 * `content` with `UNKNOWN_REPO` replaced by `repo` inside the sync section only. Unchanged when the
 * repository is still unknown, or the section has no placeholder left.
 */
export function fillInRepo(content: string, repo: string): string {
  if (repo === UNKNOWN_REPO) return content;
  const start = content.indexOf(AGENTS_SECTION_START);
  const end = content.indexOf(AGENTS_SECTION_END, start);
  if (start < 0 || end < 0) return content;
  const section = content.slice(start, end);
  if (!section.includes(UNKNOWN_REPO)) return content;
  return content.slice(0, start) + section.split(UNKNOWN_REPO).join(repo) + content.slice(end);
}
