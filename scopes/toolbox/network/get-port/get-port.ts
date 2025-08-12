/* eslint-disable no-use-before-define */
//  based on : https://github.com/sindresorhus/get-port/blob/main/index.js
import net from 'net';
import { Locked } from './locked';

export class Port {
  async get(options: { port: number | Iterable<number>; usedPort?: number[] }): Promise<number> {
    const lockedPorts = {
      old: new Set(),
      young: new Set(),
    };

    const portCheckSequence = function* (ports: any) {
      if (ports) {
        yield* ports;
      }

      yield 0;
    };

    let ports: any;
    const releaseOldLockedPortsIntervalMs = 1000 * 15;

    // Lazily create interval on first use
    let interval: any;

    if (options) {
      ports = typeof options.port === 'number' ? [options.port] : options.port;
    }

    if (interval === undefined) {
      interval = setInterval(() => {
        lockedPorts.old = lockedPorts.young;
        lockedPorts.young = new Set();
      }, releaseOldLockedPortsIntervalMs);

      // Does not exist in some environments (Electron, Jest jsdom env, browser, etc).
      if (interval.unref) {
        interval.unref();
      }
    }

    for (const port of portCheckSequence(ports)) {
      try {
        if (options.usedPort?.includes(port)) throw new Locked(port);
        let availablePort = await this.getAvailablePort({ ...options, port }); // eslint-disable-line no-await-in-loop
        while (lockedPorts.old.has(availablePort) || lockedPorts.young.has(availablePort)) {
          if (port !== 0) {
            throw new Locked(port);
          }

          availablePort = await this.getAvailablePort({ ...options, port }); // eslint-disable-line no-await-in-loop
        }

        lockedPorts.young.add(availablePort);

        return availablePort;
      } catch (error: any) {
        if (!['EADDRINUSE', 'EACCES'].includes(error.code) && !(error instanceof Locked)) {
          throw error;
        }
      }
    }

    throw new Error('No available ports found');
  }

  private async getAvailablePort(options: any): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(options, () => {
        const serverInfo = server.address();
        server.close(() => {
          // @ts-ignore
          resolve(serverInfo?.port);
        });
      });
    });
  }

  private makeRange(from: number, to: number) {
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      throw new TypeError('`from` and `to` must be integer numbers');
    }

    if (from < 1024 || from > 65535) {
      throw new RangeError('`from` must be between 1024 and 65535');
    }

    if (to < 1024 || to > 65536) {
      throw new RangeError('`to` must be between 1024 and 65536');
    }

    if (to < from) {
      throw new RangeError('`to` must be greater than or equal to `from`');
    }

    const generator = function* (f: number, t: number) {
      for (let port = f; port <= t; port += 1) {
        yield port;
      }
    };

    return generator(from, to);
  }

  static getPort(from: number, to: number, usedPort?: number[]) {
    const port = new Port();
    const range = port.makeRange(from, to);
    return port.get({ port: range, usedPort });
  }

  static getPortFromRange(range: number[] | number, usedPort?: number[]) {
    const port = new Port();
    const portsRange = typeof range === 'number' ? [range] : port.makeRange(range[0], range[1]);
    return port.get({ port: portsRange, usedPort });
  }
}
