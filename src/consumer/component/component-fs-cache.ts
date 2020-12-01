import cacache, { GetCacheObject } from 'cacache';
import path from 'path';
import { COMPONENTS_CACHE_ROOT } from '../../constants';

const LAST_TRACK_CACHE_PATH = path.join(COMPONENTS_CACHE_ROOT, 'last-track');
const DOCS_CACHE_PATH = path.join(COMPONENTS_CACHE_ROOT, 'last-track');

export async function getLastTrackTimestamp(idStr: string): Promise<number> {
  const results = await getFromCacheIfExist(LAST_TRACK_CACHE_PATH, idStr);
  return results ? parseInt(results.data.toString()) : 0;
}

export async function setLastTrackTimestamp(idStr: string, timestamp: number): Promise<void> {
  await cacache.put(LAST_TRACK_CACHE_PATH, idStr, Buffer.from(timestamp.toString()));
}

export async function getDocsFromCache(filePath: string): Promise<{ timestamp: number; data: string } | null> {
  const results = await getFromCacheIfExist(DOCS_CACHE_PATH, filePath);
  if (!results) return null;
  return { timestamp: results.metadata.timestamp, data: results.data.toString() };
}

export async function saveDocsInCache(filePath: string, docs: Record<string, any>) {
  const data = Buffer.from(JSON.stringify(docs));
  const metadata = { timestamp: Date.now() };
  await cacache.put(DOCS_CACHE_PATH, filePath, data, { metadata });
}

async function getFromCacheIfExist(cachePath: string, key: string): Promise<GetCacheObject | null> {
  try {
    const results = await cacache.get(cachePath, key);
    return results;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // cache doesn't exists
    }
    throw err;
  }
}
