import path from 'path';

function keys(value: any, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('recovery proof object');
  const names = Object.keys(value).sort();
  if (names.some((key) => !allowed.includes(key))) throw new Error('recovery proof fields');
  return names.join(',');
}

function proofKey(proof: any): string {
  const shape = keys(proof, ['path', 'hash', 'exists', 'metadata', 'range']);
  if (typeof proof.path !== 'string' || !path.isAbsolute(proof.path) || proof.path.includes('\0'))
    throw new Error('recovery proof path');
  if (proof.hash !== null && (typeof proof.hash !== 'string' || !/^[a-f\d]{64}$/.test(proof.hash)))
    throw new Error('recovery proof hash');
  if (proof.exists !== undefined && typeof proof.exists !== 'boolean') throw new Error('recovery proof existence');
  let metadata;
  if (proof.metadata !== undefined) {
    keys(proof.metadata, ['kind', 'realPath']);
    const { kind, realPath } = proof.metadata;
    if (
      !['missing', 'file', 'directory', 'other'].includes(kind) ||
      (realPath !== null && (typeof realPath !== 'string' || !path.isAbsolute(realPath)))
    )
      throw new Error('recovery proof metadata');
    metadata = { kind, realPath };
  }
  let range;
  if (proof.range !== undefined) {
    keys(proof.range, ['offset', 'length']);
    const { offset, length } = proof.range;
    if (![offset, length].every((value) => Number.isSafeInteger(value) && value >= 0))
      throw new Error('recovery proof range');
    range = { offset, length };
  }
  return JSON.stringify({ shape, path: proof.path, hash: proof.hash, exists: proof.exists, metadata, range });
}

function controls(root: string, paths: any): Set<string> {
  if (!path.isAbsolute(root) || !Array.isArray(paths) || paths.length > 32) throw new Error('recovery controls');
  const result = new Set<string>();
  const fixed = ['.bitmap', 'workspace.jsonc', '.bit/staged-snaps', '.bit/unmerged.json', 'merge-conflict'];
  for (const control of paths) {
    if (typeof control !== 'string' || result.has(control)) throw new Error('recovery duplicate control');
    const relative = path.relative(root, control).split(path.sep).join('/');
    if (
      path.resolve(root, relative) !== control ||
      relative.split('/').some((part) => !part || part === '..' || part === '.') ||
      (!fixed.includes(relative) && !/^\.bit\/staged-config\/(?:[^/]+\/)*[^/]+\.json$/.test(relative))
    )
      throw new Error('recovery uncontrolled proof transition');
    result.add(control);
  }
  return result;
}

/** Project only the native owner's exact restored controls; retain every other
 * dependency predicate, including Source hashes, metadata and range proofs. */
export function recoveryProofProjection(
  root: string,
  originalReadSet: any[],
  restoredReadSet: any[],
  restoredControls: string[]
) {
  const allowed = controls(root, restoredControls);
  if (
    !Array.isArray(originalReadSet) ||
    !Array.isArray(restoredReadSet) ||
    originalReadSet.length !== restoredReadSet.length ||
    originalReadSet.length > 16384
  )
    throw new Error('recovery proof count');
  const replacements = new Map<string, string>();
  const readSet = originalReadSet.map((original, index) => {
    const restored = restoredReadSet[index];
    const previousKey = proofKey(original);
    const nextKey = proofKey(restored);
    if (
      original.path !== restored.path ||
      Object.keys(original).sort().join(',') !== Object.keys(restored).sort().join(',') ||
      JSON.stringify(original.range) !== JSON.stringify(restored.range) ||
      (previousKey !== nextKey && !allowed.has(original.path))
    )
      throw new Error('recovery dependency proof changed');
    const serialized = JSON.stringify(restored);
    const previous = replacements.get(previousKey);
    if (previous !== undefined && proofKey(JSON.parse(previous)) !== nextKey)
      throw new Error('recovery inconsistent proof transition');
    replacements.set(previousKey, serialized);
    return JSON.parse(serialized);
  });
  return {
    readSet,
    project(proof: any) {
      const replacement = replacements.get(proofKey(proof));
      if (replacement === undefined) throw new Error('recovery uncaptured dependency proof');
      return JSON.parse(replacement);
    },
  };
}
