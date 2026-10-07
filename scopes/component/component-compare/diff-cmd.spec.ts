import { expect } from 'chai';
import type { ComponentCompareMain } from './component-compare.main.runtime';
import { DiffCmd } from './diff-cmd';

/**
 * the flag validation of "bit diff" happens before any component is read, so no workspace is needed.
 * the diff results themselves are covered in snapping/diff-cmd.spec.ts, as tagging needs that aspect.
 */
describe('bit diff flags validation', () => {
  let diffCmd: DiffCmd;
  before(() => {
    const componentCompareNotToBeReached = {
      diffByCLIValues: async () => {
        throw new Error('the flags should have been rejected before running the diff');
      },
    } as unknown as ComponentCompareMain;
    diffCmd = new DiffCmd(componentCompareNotToBeReached);
  });

  async function expectToReject(fn: () => Promise<unknown>, messagePart: string) {
    try {
      await fn();
    } catch (err: any) {
      expect(err.message).to.have.string(messagePart);
      return;
    }
    throw new Error(`expected to reject with "${messagePart}", but it resolved`);
  }

  it('--files-only + --configs-only should error', async () => {
    await expectToReject(
      () => diffCmd.report(['bar/foo', '', ''], { filesOnly: true, configsOnly: true }),
      'mutually exclusive'
    );
  });
  it('--name-only + --stat should error', async () => {
    await expectToReject(
      () => diffCmd.report(['bar/foo', '', ''], { nameOnly: true, stat: true }),
      'mutually exclusive'
    );
  });
  it('--configs-only + --file should error', async () => {
    await expectToReject(
      () => diffCmd.report(['bar/foo', '', ''], { configsOnly: true, file: 'foo.js' }),
      'mutually exclusive'
    );
  });
  it('should reject the same flags for --json', async () => {
    await expectToReject(() => diffCmd.json(['bar/foo', '', ''], { nameOnly: true, stat: true }), 'mutually exclusive');
  });
});
