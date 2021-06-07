import { Port } from '@teambit/toolbox.network.get-port';

/**
 * get an available port between range 3000 to 3200.
 */
export async function selectPort(): Promise<number> {
  return Port.getPort(3100, 3200);
}
