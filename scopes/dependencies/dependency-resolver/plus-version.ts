import semver from 'semver';
import { isHash } from '@teambit/component-version';
import { SNAP_VERSION_PREFIX } from '@teambit/component-package-version';

/**
 * a "plus" version is a placeholder for "the version this dependency resolves to in the workspace" instead of a
 * fixed version. it's mostly useful in env.jsonc (both "version" and "supportedRange") for dependencies that are
 * components. on a lane, it follows the lane snap. once the lane is merged and tagged, it follows the new tag.
 * - `+`: the exact resolved version. e.g. `2.0.21`.
 * - `+^` / `+~`: the resolved version with a range prefix. e.g. `^2.0.21`.
 *   a prefix is meaningless for a snap, so on a lane, the snap is used as is.
 */
export const PLUS_VERSIONS = ['+', '+^', '+~'] as const;

export type PlusVersion = (typeof PLUS_VERSIONS)[number];

export function isPlusVersion(version?: string): version is PlusVersion {
  return Boolean(version && (PLUS_VERSIONS as readonly string[]).includes(version));
}

/**
 * replace a plus-version placeholder with the version it resolved to. a non-plus version is returned as is.
 * the resolved version can be a tag (`2.0.21`), a snap (raw hash or its `0.0.0-<hash>` semver form) or a range
 * (e.g. when it's taken from workspace.jsonc). the prefix is added only to a tag.
 */
export function resolvePlusVersion(version: string, resolvedVersion: string): string {
  if (!isPlusVersion(version)) return version;
  const prefix = version.slice(1);
  if (!prefix || !isTagVersion(resolvedVersion)) return resolvedVersion;
  return `${prefix}${resolvedVersion}`;
}

function isTagVersion(version: string): boolean {
  if (isHash(version)) return false;
  if (!semver.valid(version)) return false;
  return !version.startsWith(SNAP_VERSION_PREFIX);
}
