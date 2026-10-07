import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import stripAnsi from 'strip-ansi';
import { BIT_HIDDEN_DIR, BIT_MAP } from '@teambit/legacy.constants';
import type { Logger } from '@teambit/logger';
import { InitCmd } from './init-cmd';
import { HostInitializerMain } from './host-initializer.main.runtime';
import { ObjectsWithoutConsumer } from './objects-without-consumer';

/**
 * the user deleted only the .bitmap file, leaving the scope objects in place.
 * "bit init" refuses to continue unless --force is used.
 */
describe('user deleted only .bitmap file leaving the objects in place', function () {
  this.timeout(0);
  let dir: string;
  let initCmd: InitCmd;

  async function runInit(flags: Record<string, any> = {}): Promise<string> {
    const originalCwd = process.cwd();
    process.chdir(dir);
    try {
      return stripAnsi((await initCmd.report([undefined as any], { skipInteractive: true, ...flags })) as string);
    } finally {
      process.chdir(originalCwd);
    }
  }

  /** a workspace that has local objects (a "tagged" component), then .bitmap is deleted */
  async function createWorkspaceWithoutBitMap() {
    fs.emptyDirSync(dir);
    await runInit({ noPackageJson: true });
    // any object in the scope makes it non-empty, which is what a tagged component leaves behind
    const objectsDir = path.join(dir, BIT_HIDDEN_DIR, 'objects');
    fs.ensureDirSync(path.join(objectsDir, 'ab'));
    fs.writeFileSync(path.join(objectsDir, 'ab', 'cdef'), 'object-content');
    fs.removeSync(path.join(dir, BIT_MAP));
  }

  before(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bit-init-bitmap-deleted-')));
    const logger = {
      off: () => {},
      console: () => {},
      consoleWarning: () => {},
    } as unknown as Logger;
    initCmd = new InitCmd(new HostInitializerMain(), logger);
  });
  after(() => {
    fs.removeSync(dir);
  });

  describe('tagging a component, then, deleting .bitmap file', () => {
    describe('bit init', () => {
      before(createWorkspaceWithoutBitMap);
      it('should throw an error', async () => {
        const error = new ObjectsWithoutConsumer(path.join(dir, BIT_HIDDEN_DIR));
        let thrown: Error | undefined;
        try {
          await runInit();
        } catch (err: any) {
          thrown = err;
        }
        expect(thrown, 'bit init should have thrown').to.be.instanceOf(ObjectsWithoutConsumer);
        expect(stripAnsi((thrown as Error).message)).to.equal(stripAnsi(error.message));
      });
    });
    describe('bit init --force', () => {
      before(createWorkspaceWithoutBitMap);
      it('should init successfully', async () => {
        const output = await runInit({ force: true });
        expect(output).to.have.string('successfully');
      });
    });
  });
});
