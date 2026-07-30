import { BitError } from '@teambit/bit-error';

/**
 * Is this a branch name git will accept?
 *
 * A conservative, **pure** subset of `git check-ref-format --branch`. Pure rather than shelling out, and
 * the trade is deliberate:
 *
 * - the names are validated in `resolveSyncConfig`, which is synchronous, runs before any git command,
 *   and is exercised by unit tests that have no repository — `git check-ref-format` would make it async,
 *   add a subprocess per configured name per run, and be unavailable exactly where the tests live;
 * - the check only has to be *safe*, not exhaustive. Every rule below rejects; none accepts something git
 *   would refuse in a way that matters here, and a name this accepts but git later rejects still fails
 *   loudly at push time with git's own message. Being stricter than git is fine; being laxer is not.
 *
 * The rule that motivated this is the first one. A configured branch name beginning with `-` is not a
 * name at all once it reaches a command line — `git push origin --delete` with `--force` as the "branch"
 * is an argument, not a ref — so it has to be refused before it is ever interpolated into a git
 * invocation. The rest are git's own ref rules, kept because a name that cannot become a ref will fail
 * mid-run (after commits have been made and pushed elsewhere) rather than at startup.
 */
export function isValidGitBranchName(name: string): boolean {
  return validateBranchName(name) === undefined;
}

/**
 * Why `name` is not a usable branch name, or undefined when it is. Separate from the boolean so the
 * error can say which rule failed instead of only that something was wrong.
 */
export function validateBranchName(name: string): string | undefined {
  if (!name) return 'it is empty';
  if (name.startsWith('-')) return 'it starts with "-", which git would read as a command-line option';
  if (/\s/.test(name)) return 'it contains whitespace';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) return 'it contains a control character';
  if (/[~^:?*[\\]/.test(name)) return 'it contains one of the characters git forbids in a ref: ~ ^ : ? * [ \\';
  if (name.includes('..')) return 'it contains ".."';
  if (name.includes('@{')) return 'it contains "@{"';
  if (name === '@') return 'it is "@", which git reserves';
  if (name.startsWith('/') || name.endsWith('/')) return 'it starts or ends with "/"';
  if (name.includes('//')) return 'it contains an empty path component ("//")';
  if (name.endsWith('.')) return 'it ends with "."';
  if (name.endsWith('.lock')) return 'it ends with ".lock"';
  if (name.split('/').some((component) => component.startsWith('.'))) return 'a path component starts with "."';
  if (name.split('/').some((component) => component.endsWith('.lock'))) return 'a path component ends with ".lock"';
  return undefined;
}

/**
 * Throw a `BitError` naming the offending config key and value unless `name` is a usable branch name.
 *
 * `configKey` is the path the user actually wrote (`sync.mainSyncBranch`, `sync.branches["my-lane"]`), so
 * the message points at the line to fix rather than at a branch name they never typed literally.
 */
export function assertValidBranchName(name: string, configKey: string): void {
  const problem = validateBranchName(name);
  if (!problem) return;
  throw new BitError(
    `bit ci sync: ${configKey} is "${name}", which is not a valid git branch name — ${problem}. ` +
      `Fix it in the "teambit.git/ci" sync config in workspace.jsonc.`
  );
}

/**
 * A `branchPrefix` is not itself a branch name — it is normally a directory-ish fragment ending in `/`
 * (`lane/`), and on its own it may legitimately be empty. So it is validated as the *start* of a name:
 * everything a name may not contain anywhere, plus the leading-`-` rule, and nothing about how it ends.
 *
 * The full check still happens on the derived name (see `laneNameToBranch`), which is what catches a
 * prefix that is fine in isolation but produces something git refuses once a lane name is appended.
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
