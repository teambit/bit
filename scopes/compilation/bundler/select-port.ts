import { Port } from '@teambit/toolbox.network.get-port';

/**
 * get an available port between range 3000 to 3200 or from port range
 */
export async function selectPort(range: number[] | number, usedPorts?: number[]): Promise<number> {
  return Port.getPortFromRange(range, usedPorts);
}
