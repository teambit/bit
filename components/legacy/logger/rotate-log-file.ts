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
 */
export function rotateLogIfNeeded(
  logPath: string,
  maxSize: number = 10 * 1024 * 1024, // 10 MB
  maxFiles: number = 9
): void {
  // Check if log file exists; if not, nothing to rotate
  let stat;
  try {
    stat = fs.statSync(logPath);
  } catch (err) {
    // If file doesn't exist, create it and exit.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      fs.ensureFileSync(logPath);
      return;
    }
    // Else re-throw
    throw err;
  }

  // If file size is below maxSize, no rotation needed
  if (stat.size < maxSize) {
    return;
  }

  // Otherwise, rotate the logs:
  const dir = path.dirname(logPath);
  const ext = path.extname(logPath);
  const base = path.basename(logPath, ext);

  // Shift older logs forward in ascending order
  // i.e. debug9.log → debug10.log, debug8.log → debug9.log, ...
  for (let i = maxFiles - 1; i > 0; i--) {
    const oldFile = path.join(dir, `${base}${i}${ext}`);
    const newFile = path.join(dir, `${base}${i + 1}${ext}`);
    if (fs.pathExistsSync(oldFile)) {
      fs.renameSync(oldFile, newFile);
    }
  }

  // Move the current log to debug1.log
  fs.renameSync(logPath, path.join(dir, `${base}1${ext}`));

  // Create a fresh, empty debug.log
  fs.ensureFileSync(logPath);
}