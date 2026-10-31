import { expect } from 'chai';
import { applyModifiedVersion } from './apply-version';
import type { MergeResultsThreeWay } from './three-way-merge';

function sourceFile(relative: string): any {
  return {
    relative,
    contents: Buffer.from(''),
    clone() {
      return sourceFile(relative);
    },
  };
}

describe('applyModifiedVersion', () => {
  it('should sort the files by path, including the files that the merge added', () => {
    const mergeResults = {
      hasConflicts: false,
      modifiedFiles: [],
      addFiles: [{ filePath: 'button.graphql.spec.ts', fsFile: sourceFile('button.graphql.spec.ts') }],
      deletedConflictFiles: [],
      removeFiles: [],
      remainDeletedFiles: [],
      overrideFiles: [],
      updatedFiles: [],
    } as unknown as MergeResultsThreeWay;
    const { modifiedFiles } = applyModifiedVersion(
      [sourceFile('index.ts'), sourceFile('button.spec.ts')],
      mergeResults,
      null
    );
    expect(modifiedFiles.map((file) => file.relative)).to.deep.equal([
      'button.graphql.spec.ts',
      'button.spec.ts',
      'index.ts',
    ]);
  });
});
