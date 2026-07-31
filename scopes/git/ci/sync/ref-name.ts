import { BitError } from '@teambit/bit-error';

/**
 * Is this a branch name git will accept? A conservative pure subset of `git check-ref-format --branch`:
 * stricter than git is fine, laxer is not. A leading `-` must be refused here because it would be read
 * as a command-line option once interpolated into a git invocation.
 */
export function isValidGitBranchName(name: string): boolean {
  return validateBranchName(name) === undefined;
}

/** Why `name` is not a usable branch name, or undefined when it is. */
export function validateBranchName(name: string): string | undefined {
  if (!name) return 'it is empty';
  if (name.startsWith('-')) return 'it starts with "-", which git would read as a command-line option';
  if (/\s/.test(name)) return 'it contains whitespace';
  // oxlint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) return 'it contains a control character';
  if (/[~^:?*[\\]/.test(name)) return 'it contains one of the characters git forbids in a ref: ~ ^ : ? * [ \\';
  if (name.includes('..')) return 'it contains ".."';
  if (name.includes('@{')) return 'it contains "@{"';
  if (name === '@') return 'it is "@", which git reserves';
  // Leading `refs/` only: pushes interpolate the name into `refs/heads/<b>`, so it would double up.
  if (name.startsWith('refs/'))
    return 'it starts with "refs/" — configure the bare branch name ("main", not "refs/heads/main")';
  if (name.startsWith('/') || name.endsWith('/')) return 'it starts or ends with "/"';
  if (name.includes('//')) return 'it contains an empty path component ("//")';
  if (name.endsWith('.')) return 'it ends with "."';
  if (name.endsWith('.lock')) return 'it ends with ".lock"';
  if (name.split('/').some((component) => component.startsWith('.'))) return 'a path component starts with "."';
  if (name.split('/').some((component) => component.endsWith('.lock'))) return 'a path component ends with ".lock"';
  return undefined;
}

/** Throw a `BitError` naming the offending config key and value unless `name` is a usable branch name. */
export function assertValidBranchName(name: string, configKey: string): void {
  const problem = validateBranchName(name);
  if (!problem) return;
  throw new BitError(
    `bit ci sync: ${configKey} is "${name}", which is not a valid git branch name — ${problem}. ` +
      `Fix it in the "teambit.git/ci" sync config in workspace.jsonc.`
  );
}

/**
 * A `branchPrefix` may end in `/` or be empty, so it is validated as the *start* of a branch name.
 * The full check still happens on the derived name (see `laneNameToBranch`).
 */
export function assertValidBranchPrefix(prefix: string, configKey: string): void {
  if (!prefix) return;
  const problem = validateBranchName(`${prefix}x`);
  if (!problem) return;
  throw new BitError(
    `bit ci sync: ${configKey} is "${prefix}", which cannot start a valid git branch name — ${problem}. ` +
      `Fix it in the "teambit.git/ci" sync config in workspace.jsonc.`
  );
}
