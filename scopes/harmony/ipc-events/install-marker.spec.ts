import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  INSTALL_MARKER_MAX_AGE_MS,
  getInstallMarkerPath,
  getInstallRunningElsewhere,
  removeInstallMarker,
  waitForInstallRunningElsewhere,
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
    const marker = await getInstallRunningElsewhere(scopePath, alive);
    expect(marker?.pid).to.equal(otherPid);
  });

  it('should report nothing when no install is running', async () => {
    expect(await getInstallRunningElsewhere(scopePath, alive)).to.be.undefined;
  });

  it('should ignore the install of the current process', async () => {
    await writeInstallMarker(scopePath);
    expect(await getInstallRunningElsewhere(scopePath, alive)).to.be.undefined;
  });

  it('should ignore a marker left behind by a process that is gone (e.g. a crashed or killed install)', async () => {
    await writeMarkerOfAnotherProcess();
    expect(await getInstallRunningElsewhere(scopePath, dead)).to.be.undefined;
  });

  it('should ignore a marker older than the max age, even when its process looks alive (hung install, reused pid)', async () => {
    const startedAt = Date.now() - INSTALL_MARKER_MAX_AGE_MS - 1;
    await writeMarkerOfAnotherProcess(startedAt);
    expect(await getInstallRunningElsewhere(scopePath, alive)).to.be.undefined;
  });

  it('should ignore a marker with a start time far in the future (e.g. the clock moved back)', async () => {
    await writeMarkerOfAnotherProcess(Date.now() + INSTALL_MARKER_MAX_AGE_MS + 60_000);
    expect(await getInstallRunningElsewhere(scopePath, alive)).to.be.undefined;
  });

  it('should ignore a corrupted marker', async () => {
    await fs.outputFile(getInstallMarkerPath(scopePath), '{"pid": ');
    expect(await getInstallRunningElsewhere(scopePath, alive)).to.be.undefined;
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

  it('should not wait when no install runs elsewhere', async () => {
    expect(await waitForInstallRunningElsewhere(scopePath, 1, alive)).to.be.undefined;
  });

  it('should wait until the install elsewhere removes its marker', async () => {
    await writeMarkerOfAnotherProcess();
    let resolved = false;
    const waiting = waitForInstallRunningElsewhere(scopePath, 5, alive).then((marker) => {
      resolved = true;
      return marker;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(resolved).to.be.false;
    await fs.remove(getInstallMarkerPath(scopePath));
    expect((await waiting)?.pid).to.equal(otherPid);
  });

  it('should stop waiting when the installing process is gone without removing its marker', async () => {
    await writeMarkerOfAnotherProcess();
    let isInstallerAlive = true;
    const waiting = waitForInstallRunningElsewhere(scopePath, 5, () => isInstallerAlive);
    await new Promise((resolve) => setTimeout(resolve, 30));
    isInstallerAlive = false; // e.g. "kill -9" of the install
    expect((await waiting)?.pid).to.equal(otherPid);
    expect(await fs.pathExists(getInstallMarkerPath(scopePath))).to.be.true;
  });
});
