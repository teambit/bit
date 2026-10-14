import path from 'path';
import fs from 'fs-extra';

export const INSTALL_MARKER_FILENAME = 'install-in-progress.json';

/**
 * an install that runs longer than this is assumed to be hung (or its marker left behind by a process whose pid
 * got reused), so other processes stop waiting for it.
 */
export const INSTALL_MARKER_MAX_AGE_MS = 30 * 60 * 1000;

export type InstallMarker = { pid: number; startedAt: number };

export function getInstallMarkerPath(scopePath: string): string {
  return path.join(scopePath, INSTALL_MARKER_FILENAME);
}

export async function writeInstallMarker(scopePath: string): Promise<void> {
  const marker: InstallMarker = { pid: process.pid, startedAt: Date.now() };
  await fs.outputJson(getInstallMarkerPath(scopePath), marker);
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
  now = Date.now(),
  isAlive: (pid: number) => boolean = isProcessAlive
): Promise<InstallMarker | undefined> {
  const marker = await readInstallMarker(scopePath);
  if (!marker) return undefined;
  if (marker.pid === process.pid) return undefined; // the in-process install is tracked by workspace.inInstallContext
  if (now - marker.startedAt > INSTALL_MARKER_MAX_AGE_MS) return undefined;
  if (!isAlive(marker.pid)) return undefined;
  return marker;
}

async function readInstallMarker(scopePath: string): Promise<InstallMarker | undefined> {
  try {
    const marker = await fs.readJson(getInstallMarkerPath(scopePath));
    if (typeof marker?.pid !== 'number' || typeof marker?.startedAt !== 'number') return undefined;
    return marker;
  } catch {
    return undefined; // missing, or half-written by the installing process
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM: the process exists but belongs to another user
    return err.code === 'EPERM';
  }
}
