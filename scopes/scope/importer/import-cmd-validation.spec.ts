import { expect } from 'chai';
import stripAnsi from 'strip-ansi';
import type { ImporterMain } from './importer.main.runtime';
import { ImportCmd } from './import.cmd';

/**
 * the flags validation of "bit import". it runs before anything is imported, so the importer can be
 * a fake. the import flows themselves are covered in the snapping aspect (import-cmd.spec.ts), which can tag.
 */
describe('bit import command flags validation', () => {
  const importCmd = new ImportCmd({ logger: { warn: () => {} } } as unknown as ImporterMain);
  const componentId = ['my-scope/comp1'];

  /** chai has no async throw assertion that also matches a message */
  async function expectToReject(fn: () => Promise<unknown>, messageParts: string[]) {
    try {
      await fn();
    } catch (err: any) {
      messageParts.forEach((part) => expect(stripAnsi(err.message)).to.have.string(part));
      return;
    }
    throw new Error(`expected to reject with "${messageParts.join('", "')}", but it resolved`);
  }

  describe('--dependencies-depth', () => {
    it('should error when used without --dependencies/--dependencies-head', async () => {
      await expectToReject(
        () => importCmd.report([componentId], { dependenciesDepth: '1' } as any),
        ['--dependencies-depth', '--dependencies']
      );
    });
    // 0 hits the `< 1` check, "abc" hits the separate Number.isInteger() check, and "1.5" guards
    // against a parseInt()-style parse, which would reject "abc" but silently accept 1.5 as 1
    ['0', 'abc', '1.5'].forEach((depth) => {
      it(`should error when it is not a positive integer (${depth})`, async () => {
        await expectToReject(
          () => importCmd.report([componentId], { dependencies: true, dependenciesDepth: depth } as any),
          ['positive integer']
        );
      });
    });
  });
});
