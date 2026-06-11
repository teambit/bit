import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import { RemoteLanes } from './remote-lanes';

describe('RemoteLanes', () => {
  // a remote lane's scope/name come from a Lane object served by a (potentially malicious) remote.
  // They must never be able to traverse outside the scope's refs directory when composing the
  // remote-lane file path. See the path-traversal finding (sibling of the isValidPath / C-2 fix).
  describe('syncWithLaneObject path-traversal guard', () => {
    let tmpDir: string;
    let remoteLanes: RemoteLanes;
    const laneWith = (name: string) => ({ name, components: [], updateDependents: [] }) as any;
    const grabError = async (fn: () => Promise<unknown>): Promise<Error | undefined> => {
      try {
        await fn();
        return undefined;
      } catch (err: any) {
        return err;
      }
    };

    beforeEach(async () => {
      // a unique temp dir + fresh instance per test, so tests never share filesystem state.
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-remote-lanes-'));
      remoteLanes = new RemoteLanes(tmpDir);
    });

    afterEach(async () => {
      await fs.remove(tmpDir);
    });

    it('should reject a lane scope containing path traversal', async () => {
      const error = await grabError(() => remoteLanes.syncWithLaneObject('../../../../etc', laneWith('cool-feature')));
      expect(error).to.be.an('error');
      expect(error?.message).to.include('invalid lane scope');
    });

    it('should reject a lane name containing path traversal', async () => {
      const error = await grabError(() =>
        remoteLanes.syncWithLaneObject('my-scope', laneWith('../../../../etc/passwd'))
      );
      expect(error).to.be.an('error');
      expect(error?.message).to.include('invalid lane name');
    });

    it('should reject an absolute lane name', async () => {
      const error = await grabError(() => remoteLanes.syncWithLaneObject('my-scope', laneWith('/etc/passwd')));
      expect(error).to.be.an('error');
      expect(error?.message).to.include('invalid lane name');
    });

    it('should reject a lane name containing a backslash', async () => {
      const error = await grabError(() => remoteLanes.syncWithLaneObject('my-scope', laneWith('..\\..\\windows')));
      expect(error).to.be.an('error');
      expect(error?.message).to.include('invalid lane name');
    });

    it('should reject an empty or "." lane name', async () => {
      const emptyError = await grabError(() => remoteLanes.syncWithLaneObject('my-scope', laneWith('')));
      expect(emptyError?.message).to.include('invalid lane name');
      const dotError = await grabError(() => remoteLanes.syncWithLaneObject('my-scope', laneWith('.')));
      expect(dotError?.message).to.include('invalid lane name');
    });

    it('should accept a valid scope and lane name without throwing the traversal guard', async () => {
      // valid identifiers must pass: scope names may contain a dot (owner.name), lane names are
      // alphanumeric + [-_$!]. No file is written here (no component heads), so this only proves
      // the guard does not produce a false positive.
      const error = await grabError(() => remoteLanes.syncWithLaneObject('owner.my-scope', laneWith('cool-feature')));
      expect(error, error?.message).to.equal(undefined);
    });
  });
});
