import fs from 'fs-extra';
import * as path from 'path';
import { generateRandomStr } from '@teambit/toolbox.string.random';

/**
 * Workspace/scope setup without paying the bit bootstrap for every call.
 *
 * `bit init`, `bit init --bare` and `bit remote add` each write only a handful of small files, but
 * every call spawns bit and pays its full startup (~0.5s) to do it. The suite makes ~3,300 such
 * calls per run, which is the largest block of process spin-up that isn't testing anything.
 *
 * Rather than hardcode a fixture — which would silently rot the moment `bit init` changes — the
 * first call in each mocha process runs the REAL command into a template directory, and every
 * later call copies that directory and rewrites the few values `bit init` derives from the path it
 * ran in. The bytes therefore always come from the `bit init` of the version under test.
 *
 * `bit remote add` has no directory to copy, but all it does is set `remotes[<remote scope name>]`
 * in the local scope.json (see `add` in global-config/remote.ts), which we can write directly.
 *
 * Set BIT_E2E_NO_SETUP_TEMPLATE=1 to spawn bit for every setup call instead. Useful for A/B
 * measurement, and for ruling the templates out when a test misbehaves.
 */

const DISABLE_TEMPLATE_ENV = 'BIT_E2E_NO_SETUP_TEMPLATE';

export function isSetupTemplateEnabled(): boolean {
  return !process.env[DISABLE_TEMPLATE_ENV];
}

/**
 * where bit keeps scope.json, in the order Consumer._getScopePath resolves it: `.bit` normally,
 * `.git/bit` when the workspace has a real `.git` directory, and the scope root for a bare scope.
 */
const SCOPE_JSON_CANDIDATES = [path.join('.bit', 'scope.json'), path.join('.git', 'bit', 'scope.json'), 'scope.json'];

function findScopeJsonPath(dir: string): string | undefined {
  return SCOPE_JSON_CANDIDATES.map((candidate) => path.join(dir, candidate)).find((candidate) =>
    fs.existsSync(candidate)
  );
}

function readJson(filePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * matches ScopeJson.toJson() — 4-space indent, no trailing newline — so the result is
 * byte-identical to a scope.json bit wrote itself.
 */
function writeScopeJson(filePath: string, content: Record<string, any>) {
  fs.writeFileSync(filePath, JSON.stringify(content, null, 4));
}

function setScopeName(dir: string, name: string) {
  const scopeJsonPath = findScopeJsonPath(dir);
  if (!scopeJsonPath) {
    throw new Error(`e2e setup-template: no scope.json found in "${dir}", the template seems incomplete`);
  }
  const scopeJson = readJson(scopeJsonPath);
  scopeJson.name = name;
  writeScopeJson(scopeJsonPath, scopeJson);
}

type RunRealInit = (cwd: string) => void;

// one template per kind per mocha process, built lazily so files that never init don't pay for one.
let workspaceTemplate: string | undefined;
let bareScopeTemplate: string | undefined;

function createTemplate(e2eDir: string, kind: string, runRealInit: RunRealInit): string {
  // the pid keeps concurrent mocha processes sharing one BIT_TEMP_ROOT off each other's template,
  // and emptying the dir first makes a leftover from a recycled pid harmless.
  const templatePath = path.join(e2eDir, `.setup-template-${kind}-${process.pid}`);
  fs.emptyDirSync(templatePath);
  runRealInit(templatePath);
  return templatePath;
}

export function ensureWorkspaceTemplate(e2eDir: string, runRealInit: RunRealInit): string {
  workspaceTemplate = workspaceTemplate || createTemplate(e2eDir, 'workspace', runRealInit);
  return workspaceTemplate;
}

export function ensureBareScopeTemplate(e2eDir: string, runRealInit: RunRealInit): string {
  bareScopeTemplate = bareScopeTemplate || createTemplate(e2eDir, 'bare-scope', runRealInit);
  return bareScopeTemplate;
}

/**
 * `bit init` derives exactly two values from the directory it runs in: the workspace name in
 * workspace.jsonc (`path.basename`) and the local scope name (`<basename>-local-<random>`, see
 * create-consumer.ts). Everything else the template holds is directory-independent.
 */
export function copyWorkspaceTemplate(templatePath: string, targetPath: string) {
  fs.copySync(templatePath, targetPath);
  const templateName = path.basename(templatePath);
  const targetName = path.basename(targetPath);
  const workspaceJsoncPath = path.join(targetPath, 'workspace.jsonc');
  const content = fs.readFileSync(workspaceJsoncPath, 'utf8');
  const updated = content.replace(`"name": "${templateName}"`, `"name": "${targetName}"`);
  if (updated === content) {
    throw new Error(
      `e2e setup-template: expected the workspace name "${templateName}" in ${workspaceJsoncPath}.
if "bit init" no longer writes the directory name there, update copyWorkspaceTemplate accordingly`
    );
  }
  fs.writeFileSync(workspaceJsoncPath, updated);
  setScopeName(targetPath, `${targetName}-local-${generateRandomStr()}`);
}

/**
 * `bit init --bare` names the scope after its directory (Scope.ensure), which is the only
 * path-derived value in a bare scope.
 */
export function copyBareScopeTemplate(templatePath: string, targetPath: string) {
  fs.copySync(templatePath, targetPath);
  setScopeName(targetPath, path.basename(targetPath));
}

/**
 * mirror of `bit remote add file://<remoteScopePath>`: read the remote's own scope name and store
 * it against the url in the local scope.json.
 *
 * returns false when either scope.json isn't where it's expected — most importantly before bit has
 * auto-created a scope in the directory, which is behavior some tests exercise deliberately — so
 * the caller can fall back to the real command.
 */
export function addFileRemoteToScopeJson(remoteScopePath: string, cwd: string): boolean {
  const remoteScopeJsonPath = findScopeJsonPath(remoteScopePath);
  const localScopeJsonPath = findScopeJsonPath(cwd);
  if (!remoteScopeJsonPath || !localScopeJsonPath) return false;
  const remoteName = readJson(remoteScopeJsonPath).name;
  if (!remoteName) return false;
  const scopeJson = readJson(localScopeJsonPath);
  scopeJson.remotes = { ...scopeJson.remotes, [remoteName]: `file://${remoteScopePath}` };
  writeScopeJson(localScopeJsonPath, scopeJson);
  return true;
}
