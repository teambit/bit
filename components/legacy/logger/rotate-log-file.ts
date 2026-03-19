import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Rotates a log file if it exceeds a certain size (e.g. 10MB).
 *
 * - If "debug.log" is bigger than `maxSize`,
 *   then move older logs forward (debug9.log → debug10.log, etc.)
 *   rename debug.log → debug1.log,
 *   and finally create an empty debug.log.
 *
 * @param logPath   Path to the main log file, e.g. "debug.log"
 * @param maxSize   Maximum size in bytes before rotation
 * @param maxFiles  Maximum number of rotated files to keep
 * @param fileDestination  Optional pino SonicBoom destination — calls reopen() after rotation
 *                         so pino writes to the new file. Pass this when rotating while the
 *                         logger is actively writing (e.g. daemon mode).
 * @returns true if rotation was performed
 */
export function rotateLogIfNeeded(
  logPath: string,
  maxSize: number = 100 * 1024 * 1024, // 100 MB
  maxFiles: number = 9,
  fileDestination?: { reopen?(): void }
): boolean {
  // Check if log file exists; if not, nothing to rotate
  let stat;
  try {
    stat = fs.statSync(logPath);
  } catch (err) {
    // If file doesn't exist, create it and exit.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      fs.ensureFileSync(logPath);
      return false;
    }
    // Else re-throw
    throw err;
  }

  // If file size is below maxSize, no rotation needed
  if (stat.size < maxSize) {
    return false;
  }

  // Otherwise, rotate the logs:
  const dir = path.dirname(logPath);
  const ext = path.extname(logPath);
  const base = path.basename(logPath, ext);

  // Remove the oldest rotated file so the shift chain doesn't fail
  // when the destination already exists (e.g. on Windows where renameSync won't overwrite)
  const maxFile = path.join(dir, `${base}${maxFiles}${ext}`);
  safeRemoveSync(maxFile);

  // Shift older logs forward in ascending order
  // i.e. debug9.log → debug10.log, debug8.log → debug9.log, ...
  for (let i = maxFiles - 1; i > 0; i--) {
    const oldFile = path.join(dir, `${base}${i}${ext}`);
    const newFile = path.join(dir, `${base}${i + 1}${ext}`);
    safeRenameSync(oldFile, newFile);
  }

  // Move the current log to debug1.log
  safeRenameSync(logPath, path.join(dir, `${base}1${ext}`));

  // Create a fresh debug.log
  fs.ensureFileSync(logPath);

  // If a pino destination was provided, reopen so it writes to the new file
  if (fileDestination?.reopen) {
    fileDestination.reopen();
  }

  return true;
}

/**
 * Enforces a total size cap on the log directory by deleting the oldest
 * debug*.log files until the total is under `maxTotalSize`.
 *
 * Targets all files matching debug*.log (daily rotated, size-rotated, and current).
 * The current debug.log is excluded from deletion so the active log is never removed.
 *
 * @param logDir       The logs directory (e.g. ~/Library/Caches/Bit/logs/)
 * @param maxTotalSize Maximum total bytes for all debug*.log files (default 1GB)
 */
export function cleanupLogsByTotalSize(
  logDir: string,
  maxTotalSize: number = 1024 * 1024 * 1024 // 1 GB
): void {
  let allFiles: string[];
  try {
    allFiles = fs.readdirSync(logDir);
  } catch {
    return; // directory doesn't exist yet
  }

  // Collect all debug*.log files with their stats
  const logFiles: { name: string; size: number; mtimeMs: number }[] = [];
  for (const name of allFiles) {
    if (name.startsWith('debug') && name.endsWith('.log')) {
      try {
        const stat = fs.statSync(path.join(logDir, name));
        logFiles.push({ name, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // file may have been removed concurrently
      }
    }
  }

  let totalSize = logFiles.reduce((sum, f) => sum + f.size, 0);
  if (totalSize <= maxTotalSize) {
    return;
  }

  // Sort by mtime ascending (oldest first) so we delete oldest first
  logFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

  for (const file of logFiles) {
    if (totalSize <= maxTotalSize) break;
    // Never delete the active debug.log
    if (file.name === 'debug.log') continue;
    safeRemoveSync(path.join(logDir, file.name));
    totalSize -= file.size;
  }
}

/**
 * Wrap renameSync in a try/catch to ignore ENOENT
 * and any "already renamed" concurrency issues.
 */
function safeRenameSync(oldPath: string, newPath: string): void {
  try {
    fs.renameSync(oldPath, newPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Wrap removeSync in try/catch to ignore ENOENT.
 */
function safeRemoveSync(filePath: string): void {
  try {
    fs.removeSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}
