import { getSync } from '../../api/consumer/lib/global-config';
import { CFG_REGISTRY_DOMAIN_PREFIX, DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../../constants';

export default function npmRegistryName(): string {
  return getSync(CFG_REGISTRY_DOMAIN_PREFIX) || DEFAULT_REGISTRY_DOMAIN_PREFIX;
}
