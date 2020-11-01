import getPort from 'get-port';

/**
 * get an available port between range 3000 to 3200.
 */
export async function selectPort(): Promise<number> {
  return getPort({ port: getPort.makeRange(3100, 3200) });
}
