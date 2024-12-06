import { CloudUser } from '@teambit/cloud.models.cloud-user';
import { CFG_USER_TOKEN_KEY, getCloudDomain } from '@teambit/legacy/dist/constants';
import * as globalConfig from '@teambit/legacy/dist/api/consumer/lib/global-config';
import { fetchWithAgent as fetch } from '@teambit/scope.network';

export async function getBitCloudUser(): Promise<CloudUser | undefined> {
  const token = await globalConfig.get(CFG_USER_TOKEN_KEY);
  if (!token) return undefined;

  try {
    const res = await fetch(`https://api.${getCloudDomain()}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const object = await res.json();
    const user = object.payload;

    return user;
  } catch (error) {
    return undefined;
  }
}
