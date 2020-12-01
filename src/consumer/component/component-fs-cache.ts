import cacache from 'cacache';
import path from 'path';
import { CACHE_ROOT } from '../../constants';

const CACHE_PATH = path.join(CACHE_ROOT, 'components-cache');
const LAST_TRACK_CACHE_PATH = path.join(CACHE_PATH, 'last-track');

export async function getLastTrackTimestamp(idStr: string): Promise<number> {
  const data = await getFromCacheIfExist(LAST_TRACK_CACHE_PATH, idStr);
  return data ? parseInt(data.toString()) : 0;
}

export async function setLastTrackTimestamp(idStr: string, timestamp: number): Promise<void> {
  await cacache.put(LAST_TRACK_CACHE_PATH, idStr, Buffer.from(timestamp.toString()));
}

async function getFromCacheIfExist(cachePath: string, key: string): Promise<Buffer | null> {
  try {
    const results = await cacache.get(cachePath, key);
    return results.data;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // cache doesn't exists
    }
    throw err;
  }
}
