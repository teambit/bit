import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { applyVersionReport } from './merge-output';
import { FileStatus } from './merge-version';
import type { FilesStatus } from './types';

// at runtime, filesStatus holds the FileStatus values (chalk strings), not its keys.
const statusOf = (file: string, status: string) => ({ [file]: status }) as FilesStatus;

describe('applyVersionReport', () => {
  const id = ComponentID.fromString('my-scope/comp1@0.0.1');
  it('should hint that a text file reported as binary is probably corrupted', () => {
    const output = applyVersionReport([{ id, filesStatus: statusOf('service.ts', FileStatus.binaryConflict) }]);
    expect(output).to.include('contains NUL bytes');
  });
  it('should not suggest corruption for a real binary file', () => {
    const output = applyVersionReport([{ id, filesStatus: statusOf('icon.png', FileStatus.binaryConflict) }]);
    expect(output).to.include('binary files cannot be merged');
    expect(output).to.not.include('NUL bytes');
  });
});
