import { expect } from 'chai';
import { join } from 'path';
import type { WriteConfigFilesResult } from '../workspace-config-files.main.runtime';
import { formatSkippedOutput } from './format-skipped-output';
import { formatWriteOutput } from './format-write-output';
import { verboseFormatWriteOutput } from './verbose-format-write-output';

const wsDir = join('/', 'my-workspace');
const skippedPath = join(wsDir, 'tsconfig.json');

function mockWriteConfigFilesResult(skippedPaths: string[]): WriteConfigFilesResult {
  return {
    wsDir,
    writeResults: {
      writersResult: [],
      totalWrittenFiles: 0,
      totalRealConfigFiles: 0,
      totalExtendingConfigFiles: 0,
      skippedPaths,
    },
  };
}

describe('formatSkippedOutput()', () => {
  it('should return an empty string when no file was skipped', () => {
    expect(formatSkippedOutput([], wsDir)).to.equal('');
  });
  it('should show the path relative to the workspace and how to override it', () => {
    const output = formatSkippedOutput([skippedPath], wsDir);
    expect(output).to.have.string('tsconfig.json');
    expect(output).to.not.have.string(wsDir);
    expect(output).to.have.string('--force');
  });
});

describe('write output with skipped files', () => {
  it('should show the skipped files', () => {
    const output = formatWriteOutput(mockWriteConfigFilesResult([skippedPath]), {});
    expect(output).to.have.string('not overridden');
    expect(output).to.have.string('tsconfig.json');
  });
  it('should show the skipped files in verbose mode as well', () => {
    const output = verboseFormatWriteOutput(mockWriteConfigFilesResult([skippedPath]), {});
    expect(output).to.have.string('not overridden');
    expect(output).to.have.string('tsconfig.json');
  });
  it('should not mention skipped files when there are none', () => {
    expect(formatWriteOutput(mockWriteConfigFilesResult([]), {})).to.not.have.string('not overridden');
    expect(verboseFormatWriteOutput(mockWriteConfigFilesResult([]), {})).to.not.have.string('not overridden');
  });
  it('should not claim the IDE is fully in-sync when a file was skipped', () => {
    const output = formatWriteOutput(mockWriteConfigFilesResult([skippedPath]), {});
    const verboseOutput = verboseFormatWriteOutput(mockWriteConfigFilesResult([skippedPath]), {});
    expect(output).to.not.have.string('IDE is now in-sync');
    expect(verboseOutput).to.not.have.string('IDE is now in-sync');
    expect(output).to.have.string('except for the files above');
    expect(verboseOutput).to.have.string('except for the files above');
  });
  it('should claim the IDE is in-sync when nothing was skipped', () => {
    expect(formatWriteOutput(mockWriteConfigFilesResult([]), {})).to.have.string('IDE is now in-sync');
    expect(verboseFormatWriteOutput(mockWriteConfigFilesResult([]), {})).to.have.string('IDE is now in-sync');
  });
});
