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
    const parsed = JSON.parse(raw);
    return isValidLastExport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isValidLastExport(value: unknown): value is LastExportData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.timestamp !== 'string') return false;
  if (!Array.isArray(v.rippleJobs) || !v.rippleJobs.every((j) => typeof j === 'string' && j.length > 0)) return false;
  if (!Array.isArray(v.exportedComponents) || !v.exportedComponents.every((c) => typeof c === 'string' && c.length > 0))
    return false;
  if (v.lane !== undefined) {
    if (!v.lane || typeof v.lane !== 'object') return false;
    const lane = v.lane as Record<string, unknown>;
    if (typeof lane.scope !== 'string' || lane.scope.length === 0) return false;
    if (typeof lane.name !== 'string' || lane.name.length === 0) return false;
  }
  return true;
}
