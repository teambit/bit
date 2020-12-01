import cacache from 'cacache';
import path from 'path';
import { CACHE_ROOT } from '../../constants';

const CACHE_PATH = path.join(CACHE_ROOT, 'components-cache');

export async function getLastTrackTimestamp(idStr: string): Promise<number> {
  const key = `${idStr}-last-track`;
  const data = await getFromCacheIfExist(key);
  return data ? parseInt(data.toString()) : 0;
}

export async function setLastTrackTimestamp(idStr: string, timestamp: number): Promise<void> {
  const key = `${idStr}-last-track`;
  await cacache.put(CACHE_PATH, key, Buffer.from(timestamp.toString()));
}

async function getFromCacheIfExist(key: string): Promise<Buffer | null> {
  try {
    const results = await cacache.get(CACHE_PATH, key);
    return results.data;
  } catch(err) {
    if (err.code === 'ENOENT') {
      return null; // cache doesn't exists
    }
    throw err;
  }
}
