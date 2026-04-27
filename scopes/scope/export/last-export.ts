import path from 'path';
import fs from 'fs-extra';

const LAST_EXPORT_FILE = 'last-export.json';

export interface LastExportData {
  timestamp: string;
  /** ripple job slugs returned by the central-hub — used to look up jobs via getJob(slug) */
  rippleJobs: string[];
  lane?: { scope: string; name: string };
  exportedComponents: string[];
}

export function getLastExportPath(scopePath: string): string {
  return path.join(scopePath, LAST_EXPORT_FILE);
}

export async function writeLastExport(scopePath: string, data: LastExportData): Promise<void> {
  await fs.writeFile(getLastExportPath(scopePath), JSON.stringify(data, null, 2));
}

export async function readLastExport(scopePath: string): Promise<LastExportData | null> {
  const filePath = getLastExportPath(scopePath);
  if (!(await fs.pathExists(filePath))) return null;
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as LastExportData;
  } catch {
    return null;
  }
}
