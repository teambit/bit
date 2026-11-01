import path from 'path';
import fs from 'fs-extra';

/**
 * an install that runs longer than this is assumed to be hung (or its marker left behind by a process whose pid
 * got reused), so other processes stop waiting for it.
 */
export const INSTALL_MARKER_MAX_AGE_MS = 30 * 60 * 1000;

const POLL_MS = 2000;

export type InstallMarker = { pid: number; startedAt: number };

export function getInstallMarkerPath(scopePath: string): string {
  return path.join(scopePath, 'install-in-progress.json');
}

export async function writeInstallMarker(scopePath: string): Promise<void> {
  const marker: InstallMarker = { pid: process.pid, startedAt: Date.now() };
  const markerPath = getInstallMarkerPath(scopePath);
  // write-then-rename, so a reader never sees a half-written marker (which it would take as "no install")
  const tmpPath = `${markerPath}.${process.pid}.tmp`;
  await fs.outputJson(tmpPath, marker);
  await fs.rename(tmpPath, markerPath);
}

/**
 * removes the marker only when this process wrote it, so a process that finishes after another one started
 * installing doesn't hide the other install.
 */
export async function removeInstallMarker(scopePath: string): Promise<void> {
  const marker = await readInstallMarker(scopePath);
  if (marker && marker.pid !== process.pid) return;
  await fs.remove(getInstallMarkerPath(scopePath));
}

/**
 * returns the marker of an install that is currently running in a *different* process, or undefined.
 * the marker is ignored when it can't be trusted: the process that wrote it is gone (crashed or killed before
 * removing it), it is older than INSTALL_MARKER_MAX_AGE_MS, or it is unreadable. so a failed install can never
 * leave other processes waiting for it indefinitely.
 */
export async function getInstallRunningElsewhere(
  scopePath: string,
  isAlive: (pid: number) => boolean = isProcessAlive
): Promise<InstallMarker | undefined> {
  const marker = await readInstallMarker(scopePath);
  if (!marker) return undefined;
  if (marker.pid === process.pid) return undefined; // the in-process install is tracked by workspace.inInstallContext
  // abs: a marker "from the future" (e.g. the clock moved back) shouldn't hold others for longer than the max age
  if (Math.abs(Date.now() - marker.startedAt) > INSTALL_MARKER_MAX_AGE_MS) return undefined;
  if (!isAlive(marker.pid)) return undefined;
  return marker;
}

/**
 * resolves once no install runs in another process. returns the marker of the install it waited for, if any.
 */
export async function waitForInstallRunningElsewhere(
  scopePath: string,
  pollMs = POLL_MS,
  isAlive?: (pid: number) => boolean
): Promise<InstallMarker | undefined> {
  const waitedFor = await getInstallRunningElsewhere(scopePath, isAlive);
  let running = waitedFor;
  while (running) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    running = await getInstallRunningElsewhere(scopePath, isAlive);
  }
  return waitedFor;
}

async function readInstallMarker(scopePath: string): Promise<InstallMarker | undefined> {
  try {
    const marker = await fs.readJson(getInstallMarkerPath(scopePath));
    if (typeof marker?.pid !== 'number' || typeof marker?.startedAt !== 'number') return undefined;
    return marker;
  } catch {
    return undefined; // missing, or not written by bit
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM: the process exists but belongs to another user
    return err.code === 'EPERM';
  }
}
