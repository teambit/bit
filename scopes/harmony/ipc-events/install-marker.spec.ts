import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  INSTALL_MARKER_MAX_AGE_MS,
  getInstallMarkerPath,
  getInstallRunningElsewhere,
  removeInstallMarker,
  writeInstallMarker,
} from './install-marker';

describe('install marker', () => {
  let scopePath: string;
  const otherPid = process.pid + 1;
  const alive = () => true;
  const dead = () => false;

  beforeEach(async () => {
    scopePath = await fs.mkdtemp(path.join(os.tmpdir(), 'install-marker-'));
  });
  afterEach(async () => {
    await fs.remove(scopePath);
  });

  async function writeMarkerOfAnotherProcess(startedAt = Date.now()) {
    await fs.outputJson(getInstallMarkerPath(scopePath), { pid: otherPid, startedAt });
  }

  it('should report an install running in another process', async () => {
    await writeMarkerOfAnotherProcess();
    const marker = await getInstallRunningElsewhere(scopePath, Date.now(), alive);
    expect(marker?.pid).to.equal(otherPid);
  });

  it('should report nothing when no install is running', async () => {
    expect(await getInstallRunningElsewhere(scopePath, Date.now(), alive)).to.be.undefined;
  });

  it('should ignore the install of the current process', async () => {
    await writeInstallMarker(scopePath);
    expect(await getInstallRunningElsewhere(scopePath, Date.now(), alive)).to.be.undefined;
  });

  it('should ignore a marker left behind by a process that is gone (e.g. a crashed or killed install)', async () => {
    await writeMarkerOfAnotherProcess();
    expect(await getInstallRunningElsewhere(scopePath, Date.now(), dead)).to.be.undefined;
  });

  it('should ignore a marker older than the max age, even when its process looks alive (hung install, reused pid)', async () => {
    const startedAt = Date.now() - INSTALL_MARKER_MAX_AGE_MS - 1;
    await writeMarkerOfAnotherProcess(startedAt);
    expect(await getInstallRunningElsewhere(scopePath, Date.now(), alive)).to.be.undefined;
  });

  it('should ignore a corrupted marker', async () => {
    await fs.outputFile(getInstallMarkerPath(scopePath), '{"pid": ');
    expect(await getInstallRunningElsewhere(scopePath, Date.now(), alive)).to.be.undefined;
  });

  it('should treat the parent process as alive with the default liveness check', async () => {
    await fs.outputJson(getInstallMarkerPath(scopePath), { pid: process.ppid, startedAt: Date.now() });
    expect((await getInstallRunningElsewhere(scopePath))?.pid).to.equal(process.ppid);
  });

  it('should remove the marker it wrote', async () => {
    await writeInstallMarker(scopePath);
    await removeInstallMarker(scopePath);
    expect(await fs.pathExists(getInstallMarkerPath(scopePath))).to.be.false;
  });

  it('should not remove the marker of an install another process started meanwhile', async () => {
    await writeMarkerOfAnotherProcess();
    await removeInstallMarker(scopePath);
    expect(await fs.pathExists(getInstallMarkerPath(scopePath))).to.be.true;
  });
});
