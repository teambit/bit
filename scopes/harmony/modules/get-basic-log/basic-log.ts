import { CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY } from '@teambit/legacy.constants';
import type { Log } from '@teambit/objects';
import { getBitCloudUser } from '@teambit/cloud.modules.get-cloud-user';
import { getConfig } from '@teambit/config-store';

export async function getBasicLog(): Promise<Log> {
  const username = (await getBitCloudUsername()) || getConfig(CFG_USER_NAME_KEY);
  const email = getConfig(CFG_USER_EMAIL_KEY);
  return {
    username,
    email,
    message: '',
    date: Date.now().toString(),
  };
}

async function getBitCloudUsername() {
  const user = await getBitCloudUser();
  return user?.username;
}
