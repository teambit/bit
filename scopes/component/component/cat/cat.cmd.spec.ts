import { expect } from 'chai';
import type { ComponentMain } from '../component.main.runtime';
import { CatCmd } from './cat.cmd';

/**
 * how "bit cat" lays out a component. the component comes from a fake host, so these need no
 * workspace. reading a tagged version through a real host is covered in the snapping aspect
 * (cat-versions.spec.ts), which can tag.
 */
describe('bit cat command', () => {
  const fooContent = "module.exports = function foo() { return 'v1'; };\n";

  const fakeComponent = {
    id: { toStringWithoutVersion: () => 'my-scope/bar/foo', version: '0.0.1' },
    state: {
      filesystem: { files: [{ relative: 'foo.js', contents: Buffer.from(fooContent) }] },
      aspects: {
        get: (aspectId: string) => (aspectId === 'teambit.envs/envs' ? { config: { env: 'my-env' } } : undefined),
      },
    },
    getDependencies: () => ({
      toDependenciesManifest: () => ({ dependencies: { 'is-string': '1.0.0' }, devDependencies: {} }),
    }),
  };

  const fakeComponentMain = {
    getHost: () => ({
      resolveComponentId: async (idStr: string) => idStr,
      get: async () => fakeComponent,
    }),
  } as unknown as ComponentMain;

  const catCmd = new CatCmd(fakeComponentMain);
  const noFlags = { config: false, all: false, json: false };

  /** chai has no async throw assertion that also matches a message */
  async function expectToReject(fn: () => Promise<unknown>, messagePart: string) {
    try {
      await fn();
    } catch (err: any) {
      expect(err.message).to.have.string(messagePart);
      return;
    }
    throw new Error(`expected to reject with "${messagePart}", but it resolved`);
  }

  it('should show all source files with headers', async () => {
    const output = await catCmd.report(['bar/foo'], noFlags);
    expect(output).to.have.string('--- foo.js ---');
    expect(output).to.have.string("return 'v1'");
  });

  it('should show a specific file with --file (raw, no header)', async () => {
    const output = await catCmd.report(['bar/foo'], { ...noFlags, file: 'foo.js' });
    expect(output).to.equal(fooContent);
  });

  it('should error when --file references a non-existent file', async () => {
    await expectToReject(
      () => catCmd.report(['bar/foo'], { ...noFlags, file: 'nonexistent.js' }),
      'file "nonexistent.js" not found in component. available files: foo.js'
    );
  });

  it('should show config instead of files with --config', async () => {
    const output = await catCmd.report(['bar/foo'], { ...noFlags, config: true });
    expect(output).to.not.have.string('--- foo.js ---');
    expect(output).to.have.string('env: my-env');
    expect(output).to.have.string('dependencies:\n  is-string: 1.0.0');
    expect(output).to.not.have.string('devDependencies');
  });

  it('should refuse --file with --config, unless --all is given', async () => {
    await expectToReject(
      () => catCmd.report(['bar/foo'], { ...noFlags, config: true, file: 'foo.js' }),
      '--file cannot be used with --config'
    );
  });

  it('should show both files and config with --all', async () => {
    const output = await catCmd.report(['bar/foo'], { ...noFlags, all: true });
    expect(output).to.have.string('--- foo.js ---');
    expect(output).to.have.string('env: my-env');
  });

  it('should output the id, version and files with --json', async () => {
    const result = await catCmd.json(['bar/foo'], noFlags);
    expect(result).to.deep.equal({
      id: 'my-scope/bar/foo',
      version: '0.0.1',
      files: [{ path: 'foo.js', content: fooContent }],
    });
  });

  it('should error when there is no host', async () => {
    const hostless = new CatCmd({ getHost: () => undefined } as unknown as ComponentMain);
    await expectToReject(() => hostless.report(['bar/foo'], noFlags), 'unable to find a component host');
  });
});
