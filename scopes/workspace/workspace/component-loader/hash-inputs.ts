import type { Phase } from './phase';

/**
 * Inputs needed to compute a phase-specific cache hash. The loader populates
 * only the fields relevant to the requested phase: lower phases never depend
 * on higher-phase inputs.
 *
 * | Field                 | Required by phase           |
 * | --------------------- | --------------------------- |
 * | `idStr`               | all                         |
 * | `bitmapHash`          | all                         |
 * | `fileSignature`       | files, dependencies, extensions, aspects |
 * | `componentConfigHash` | dependencies, extensions, aspects |
 * | `workspaceConfigHash` | extensions, aspects         |
 * | `aspectStateHash`     | aspects                     |
 *
 * The values themselves are opaque strings — the loader is free to use mtime+size
 * concatenations, sha1 digests, or version counters. The cache compares strings
 * for equality only.
 */
export interface HashInputContext {
  /** Component ID serialized to its canonical string form. */
  idStr: string;

  /** Hash or version of `.bitmap`. Affects every phase. */
  bitmapHash: string;

  /** Per-component file signature (e.g. mtime+size of every owned file, joined deterministically). */
  fileSignature?: string;

  /** Hash of component-level config inputs (component.json, package.json variants). */
  componentConfigHash?: string;

  /** Hash of workspace.jsonc, variants policy, and any other workspace-wide extension inputs. */
  workspaceConfigHash?: string;

  /** Snapshot of aspect resolution state (resolved aspect package paths, slot registrations). */
  aspectStateHash?: string;
}

/** Bumped when the format of the hash string changes; busts every existing entry on next read. */
const HASH_VERSION = 'v1';

/**
 * Composes a stable string capturing every input that can change the loaded
 * value at the given phase. Two equal strings under the same phase are
 * sufficient to declare a cache hit; a difference indicates the entry is stale.
 *
 * Throws if a required input for the given phase is missing — this is a
 * programming error in the loader, not a runtime condition.
 */
export function getHashInputs(phase: Phase, ctx: HashInputContext): string {
  const parts: string[] = [HASH_VERSION, `phase=${phase}`, `id=${ctx.idStr}`, `bitmap=${ctx.bitmapHash}`];
  if (phase === 'identity') return parts.join('|');

  requireField(phase, ctx, 'fileSignature');
  parts.push(`files=${ctx.fileSignature}`);
  if (phase === 'files') return parts.join('|');

  requireField(phase, ctx, 'componentConfigHash');
  parts.push(`compConfig=${ctx.componentConfigHash}`);
  if (phase === 'dependencies') return parts.join('|');

  requireField(phase, ctx, 'workspaceConfigHash');
  parts.push(`wsConfig=${ctx.workspaceConfigHash}`);
  if (phase === 'extensions') return parts.join('|');

  requireField(phase, ctx, 'aspectStateHash');
  parts.push(`aspects=${ctx.aspectStateHash}`);
  return parts.join('|');
}

function requireField(phase: Phase, ctx: HashInputContext, field: keyof HashInputContext): void {
  if (ctx[field] === undefined) {
    throw new Error(`getHashInputs: phase "${phase}" requires "${field}", but none was provided for ${ctx.idStr}`);
  }
}
