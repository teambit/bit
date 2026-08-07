import { expect } from 'chai';
import type { SourceFile } from '@teambit/component.sources';
import { compareFiles } from './context-drift-detector';

/**
 * Minimal SourceFile stand-in: only `.relative` and the hash chain `compareFiles` reads.
 * A regression fixture for the bug this covers: SourceFile has no `.relativePath` (Vinyl exposes
 * `.relative`); reading the wrong property collapsed every file to one `undefined`-keyed map
 * entry, so only the last file's hash was ever compared.
 */
function file(relative: string, hash: string): SourceFile {
  return { relative, toSourceAsLinuxEOL: () => ({ hash: () => ({ hash }) }) } as unknown as SourceFile;
}

describe('compareFiles', () => {
  const recorded = [file('index.js', 'hash-index'), file('utils.js', 'hash-utils')];

  // same paths, same content hash — a real fixture's deprecated `test`/`name` prop discrepancy
  // plays no part here, since this function reads only path and hash. That is what lets the
  // caller attribute an unchanged-content, files/specs-only field diff to those deprecated props.
  it('reports unchanged for identical multi-file sets', () => {
    const workspace = [file('index.js', 'hash-index'), file('utils.js', 'hash-utils')];
    expect(compareFiles(recorded, workspace)).to.deep.equal({ filesChanged: false, pathSetsEqual: true });
  });

  it('catches a content edit on a NON-last file — the exact shape the relative/relativePath bug hid', () => {
    const workspace = [file('index.js', 'hash-index-EDITED'), file('utils.js', 'hash-utils')];
    const res = compareFiles(recorded, workspace);
    expect(res.filesChanged).to.equal(true);
    expect(res.pathSetsEqual).to.equal(true);
  });

  it('catches a file added, keeping the recorded pair otherwise identical', () => {
    const workspace = [file('index.js', 'hash-index'), file('utils.js', 'hash-utils'), file('new.js', 'hash-new')];
    const res = compareFiles(recorded, workspace);
    expect(res.filesChanged).to.equal(true);
    expect(res.pathSetsEqual).to.equal(false);
  });

  it('catches a file deleted, keeping the remaining file identical', () => {
    const workspace = [file('index.js', 'hash-index')];
    const res = compareFiles(recorded, workspace);
    expect(res.filesChanged).to.equal(true);
    expect(res.pathSetsEqual).to.equal(false);
  });
});
