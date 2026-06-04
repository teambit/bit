import { CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY } from '@teambit/legacy.constants';
import type { LaneId } from '@teambit/lane-id';
import type { Log } from '@teambit/objects';
import { getBitCloudUser } from '@teambit/cloud.modules.get-cloud-user';
import { getConfig } from '@teambit/config-store';

// The identity (Bit Cloud username + git config name/email) is process-stable. Cache the
// in-flight promise so a single user does N calls (e.g. per-component during a large merge or
// snap) without N HTTP requests to api.<cloudDomain>/user — which slows the operation and can
// trigger rate limiting. Caching the promise (not the awaited value) also dedupes concurrent
// callers that race the first resolve.
let cachedIdentity: Promise<{ username: string | undefined; email: string | undefined }> | undefined;
async function getIdentity() {
  if (!cachedIdentity) {
    cachedIdentity = (async () => {
      const username = (await getBitCloudUsername()) || getConfig(CFG_USER_NAME_KEY);
      const email = getConfig(CFG_USER_EMAIL_KEY);
      return { username, email };
    })();
  }
  return cachedIdentity;
}

export async function getBasicLog(): Promise<Log> {
  const { username, email } = await getIdentity();
  return {
    username,
    email,
    message: '',
    date: Date.now().toString(),
  };
}

export async function getLogForSquash(otherLaneId: LaneId): Promise<Log> {
  return {
    ...(await getBasicLog()),
    message: `squashed during merge from ${otherLaneId.toString()}`,
  };
}

async function getBitCloudUsername() {
  const user = await getBitCloudUser();
  return user?.username;
}
