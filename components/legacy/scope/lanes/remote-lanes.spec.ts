import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { RemoteLanes } from './remote-lanes';

describe('RemoteLanes', () => {
  // a remote lane's scope/name come from a Lane object served by a (potentially malicious) remote.
  // They must never be able to traverse outside the scope's refs directory when composing the
  // remote-lane file path. See the path-traversal finding (sibling of the isValidPath / C-2 fix).
  describe('syncWithLaneObject path-traversal guard', () => {
    const remoteLanes = new RemoteLanes(path.join(os.tmpdir(), 'bit-remote-lanes-spec'));
    const laneWith = (name: string) => ({ name, components: [], updateDependents: [] }) as any;

    it('should reject a lane scope containing path traversal', async () => {
      let error: Error | undefined;
      try {
        await remoteLanes.syncWithLaneObject('../../../../etc', laneWith('cool-feature'));
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error?.message).to.include('invalid lane scope');
    });

    it('should reject a lane name containing path traversal', async () => {
      let error: Error | undefined;
      try {
        await remoteLanes.syncWithLaneObject('my-scope', laneWith('../../../../etc/passwd'));
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error?.message).to.include('invalid lane name');
    });

    it('should reject an absolute lane name', async () => {
      let error: Error | undefined;
      try {
        await remoteLanes.syncWithLaneObject('my-scope', laneWith('/etc/passwd'));
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error?.message).to.include('invalid lane name');
    });

    it('should reject a lane name containing a backslash', async () => {
      let error: Error | undefined;
      try {
        await remoteLanes.syncWithLaneObject('my-scope', laneWith('..\\..\\windows'));
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error?.message).to.include('invalid lane name');
    });

    it('should accept a valid scope and lane name without throwing the traversal guard', async () => {
      // valid identifiers must pass: scope names may contain a dot (owner.name), lane names are
      // alphanumeric + [-_$!]. No file is written here (no component heads), so this only proves
      // the guard does not produce a false positive.
      let error: Error | undefined;
      try {
        await remoteLanes.syncWithLaneObject('owner.my-scope', laneWith('cool-feature'));
      } catch (err: any) {
        error = err;
      }
      expect(error, error?.message).to.equal(undefined);
    });
  });
});
