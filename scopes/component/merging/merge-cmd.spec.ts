import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { FileStatus, type ApplyVersionResult } from '@teambit/component.modules.merge-helper';
import { mergeReport } from './merge-cmd';

describe('mergeReport', () => {
  // the files status holds the FileStatus values at runtime (same as apply-version.ts)
  const filesStatus: Record<string, any> = { 'index.ts': FileStatus.manual };
  const components: ApplyVersionResult[] = [{ id: ComponentID.fromString('my-scope/comp1@0.0.1'), filesStatus }];
  const getOutput = (abortCommand?: string): string => {
    const report = mergeReport({ components, leftUnresolvedConflicts: true, abortCommand });
    return typeof report === 'string' ? report : report.data;
  };
  it('should suggest "bit merge --abort" by default when there are conflicts', () => {
    expect(getOutput()).to.include('to cancel the merge, run "bit merge --abort"');
  });
  it('should suggest the given abort command when there are conflicts', () => {
    expect(getOutput('bit lane merge-abort')).to.include('to cancel the merge, run "bit lane merge-abort"');
  });
  it('should not suggest canceling when there are no conflicts', () => {
    const report = mergeReport({ components, leftUnresolvedConflicts: false });
    const output = typeof report === 'string' ? report : report.data;
    expect(output).to.not.include('to cancel the merge');
  });
});
