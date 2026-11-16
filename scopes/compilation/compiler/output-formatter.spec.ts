import { expect } from 'chai';
import stripAnsi from 'strip-ansi';
import { formatWatchCompileResults } from './output-formatter';
import type { BuildResult } from './workspace-compiler';

describe('formatWatchCompileResults', () => {
  it('should show success when the compiler returned no errors', () => {
    const results: BuildResult[] = [{ component: 'my-scope/button', buildResults: [], errors: [] }];
    const output = stripAnsi(formatWatchCompileResults(results));
    expect(output).to.include('SUCCESS\tmy-scope/button');
    expect(output).to.not.include('FAILURE');
  });
  it('should show failure when the compiler returned errors', () => {
    const results: BuildResult[] = [
      { component: 'my-scope/button', buildResults: [], errors: [{ path: 'button', error: new Error('oops') }] },
    ];
    const output = stripAnsi(formatWatchCompileResults(results));
    expect(output).to.include('FAILURE\tmy-scope/button');
    expect(output).to.not.include('SUCCESS');
  });
});
