import path from 'path';
import fs from 'fs-extra';

/**
 * Rotates debug.log to a file named "debug-YYYY-MM-DD.log" if it was last
 * modified on a previous day. Keeps only the most recent `maxFiles` daily logs.
 *
 * Ignores ENOENT on file ops to avoid concurrency edge cases.
 */
export function rotateLogDaily(
  logPath: string,
  maxFiles = 7 // a week sounds reasonable
): void {
  // 1. If debug.log doesn't exist, create it.
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

  // 2. Check if debug.log's last-modified date is a previous day.
  const mTime = stat.mtime; // last modification time
  const now = new Date();

  // If it is still "today", no rotation needed.
  if (!isDifferentDay(mTime, now)) {
    return;
  }

  // 3. If it’s a previous day, rename debug.log → debug-YYYY-MM-DD.log
  const dir = path.dirname(logPath);
  const ext = path.extname(logPath);
  const base = path.basename(logPath, ext);
  const dateStr = formatDate(mTime); // e.g. "2025-02-27"
  const datedFile = path.join(dir, `${base}-${dateStr}${ext}`);

  safeRenameSync(logPath, datedFile);

  // 4. Create a fresh debug.log
  fs.ensureFileSync(logPath);

  // 5. Clean up older logs if we exceed `maxFiles`.
  //    We collect all files matching "debug-YYYY-MM-DD.log", sorted by date.
  cleanupOldDailyLogs(dir, base, ext, maxFiles);
}

/**
 * Removes older daily logs beyond the `maxFiles` limit.
 * We assume files are named "debug-YYYY-MM-DD.log" so that
 * alphabetical sort == chronological order.
 *
 * @param dir       Directory containing the log files
 * @param base      Base log name (e.g. "debug")
 * @param ext       Log file extension (e.g. ".log")
 * @param maxFiles  Maximum number of daily logs to keep
 */
function cleanupOldDailyLogs(dir: string, base: string, ext: string, maxFiles: number): void {
  const allFiles = fs.readdirSync(dir);

  // e.g. prefix = "debug-", suffix = ".log"
  const prefix = `${base}-`;
  const suffix = ext;

  // 1. Collect files like "debug-2025-02-27.log"
  const dailyLogs = allFiles.filter((filename) => filename.startsWith(prefix) && filename.endsWith(suffix));

  // 2. Sort ascending by filename, which also sorts by date
  //    because "YYYY-MM-DD" sorts chronologically.
  dailyLogs.sort();

  // 3. Keep only the last `maxFiles` entries (the newest).
  while (dailyLogs.length > maxFiles) {
    const oldest = dailyLogs.shift(); // remove the oldest
    if (oldest) {
      safeRemoveSync(path.join(dir, oldest));
    }
  }
}

/**
 * Returns true if two dates differ in year, month, or day.
 */
function isDifferentDay(a: Date, b: Date): boolean {
  return a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate();
}

/**
 * Format date as "YYYY-MM-DD" from a Date object.
 */
function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
