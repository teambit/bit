import net from 'net';
import fs from 'fs-extra';
import path from 'path';
import type { Event } from '@parcel/watcher';
import type { Logger } from '@teambit/logger';

const SOCKET_FILENAME = 'watcher.sock';
const LOCK_FILENAME = 'watcher.lock';
const HEARTBEAT_INTERVAL_MS = 5000;
const CONNECTION_TIMEOUT_MS = 3000;

export type WatcherEvent = {
  type: 'events';
  events: Event[];
};

export type WatcherError = {
  type: 'error';
  message: string;
  isDropError?: boolean;
};

export type WatcherHeartbeat = {
  type: 'heartbeat';
  timestamp: number;
};

export type WatcherReady = {
  type: 'ready';
};

export type WatcherMessage = WatcherEvent | WatcherError | WatcherHeartbeat | WatcherReady;

/**
 * WatcherDaemon is the server-side of the shared watcher infrastructure.
 * It runs a Unix domain socket server and broadcasts file system events to all connected clients.
 *
 * Only ONE daemon can run per workspace. The daemon is responsible for:
 * 1. Subscribing to Parcel Watcher for file system events
 * 2. Broadcasting events to all connected clients
 * 3. Sending heartbeats to clients so they know the daemon is alive
 * 4. Cleaning up resources on shutdown
 */
export class WatcherDaemon {
  private server: net.Server | null = null;
  private clients: Set<net.Socket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(
    private scopePath: string,
    private logger: Logger
  ) {}

  get socketPath(): string {
    return path.join(this.scopePath, SOCKET_FILENAME);
  }

  get lockPath(): string {
    return path.join(this.scopePath, LOCK_FILENAME);
  }

  /**
   * Check if a daemon is already running for this workspace
   */
  static async isRunning(scopePath: string): Promise<boolean> {
    const lockPath = path.join(scopePath, LOCK_FILENAME);
    const socketPath = path.join(scopePath, SOCKET_FILENAME);

    // Check if lock file exists
    if (!(await fs.pathExists(lockPath))) {
      return false;
    }

    // Check if the PID in lock file is still alive
    try {
      const lockContent = await fs.readFile(lockPath, 'utf8');
      const { pid } = JSON.parse(lockContent);

      // Check if process is running
      try {
        process.kill(pid, 0); // Signal 0 doesn't kill, just checks if process exists
      } catch {
        // Process doesn't exist, clean up stale lock
        await fs.remove(lockPath);
        await fs.remove(socketPath);
        return false;
      }

      // Process exists, try to connect to verify it's actually the daemon
      const canConnect = await WatcherDaemon.tryConnect(socketPath);
      if (!canConnect) {
        // Lock file exists but socket doesn't respond - stale lock
        await fs.remove(lockPath);
        await fs.remove(socketPath);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Try to connect to an existing daemon socket
   */
  private static tryConnect(socketPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection(socketPath);
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, CONNECTION_TIMEOUT_MS);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Start the daemon server
   */
  async start(): Promise<void> {
    // Remove any stale socket file
    await fs.remove(this.socketPath);

    // Create lock file with our PID
    await fs.outputFile(
      this.lockPath,
      JSON.stringify({
        pid: process.pid,
        startTime: Date.now(),
      })
    );

    // Create Unix domain socket server
    this.server = net.createServer((socket) => this.handleConnection(socket));

    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.on('error', (err) => {
        this.logger.error(`Watcher daemon server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        this.logger.debug(`Watcher daemon started on ${this.socketPath}`);
        this.startHeartbeat();
        resolve();
      });
    });
  }

  /**
   * Handle a new client connection
   */
  private handleConnection(socket: net.Socket): void {
    this.clients.add(socket);
    this.logger.debug(`Watcher daemon: client connected (${this.clients.size} total)`);

    // Send ready message to new client
    this.sendToClient(socket, { type: 'ready' });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.logger.debug(`Watcher daemon: client disconnected (${this.clients.size} total)`);
    });

    socket.on('error', (err) => {
      this.logger.debug(`Watcher daemon: client error - ${err.message}`);
      this.clients.delete(socket);
    });
  }

  /**
   * Broadcast events to all connected clients
   */
  broadcast(message: WatcherMessage): void {
    const data = JSON.stringify(message) + '\n';

    for (const client of this.clients) {
      try {
        client.write(data);
      } catch (err: any) {
        this.logger.debug(`Failed to send to client: ${err.message}`);
        this.clients.delete(client);
      }
    }
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(socket: net.Socket, message: WatcherMessage): void {
    try {
      socket.write(JSON.stringify(message) + '\n');
    } catch (err: any) {
      this.logger.debug(`Failed to send to client: ${err.message}`);
    }
  }

  /**
   * Broadcast file system events from Parcel watcher
   */
  broadcastEvents(events: Event[]): void {
    this.broadcast({ type: 'events', events });
  }

  /**
   * Broadcast an error to all clients
   */
  broadcastError(message: string, isDropError = false): void {
    this.broadcast({ type: 'error', message, isDropError });
  }

  /**
   * Start sending heartbeats to clients
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({ type: 'heartbeat', timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Get the number of connected clients
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Stop the daemon and cleanup
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    this.logger.debug('Watcher daemon stopping...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    // Remove lock and socket files
    await fs.remove(this.lockPath);
    await fs.remove(this.socketPath);

    this.logger.debug('Watcher daemon stopped');
  }
}

/**
 * WatcherClient connects to an existing WatcherDaemon to receive file system events.
 *
 * Usage:
 * ```typescript
 * const client = new WatcherClient(scopePath, logger);
 * await client.connect();
 * client.onEvents((events) => { ... });
 * client.onError((err) => { ... });
 * ```
 */
export class WatcherClient {
  private socket: net.Socket | null = null;
  private eventsHandler: ((events: Event[]) => void) | null = null;
  private errorHandler: ((error: WatcherError) => void) | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private buffer = '';
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(
    private scopePath: string,
    private logger: Logger
  ) {}

  get socketPath(): string {
    return path.join(this.scopePath, SOCKET_FILENAME);
  }

  /**
   * Connect to the daemon
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);

      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT_MS);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.logger.debug('Watcher client connected to daemon');
        resolve();
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this.isConnected = false;
        this.logger.debug('Watcher client disconnected from daemon');
        this.disconnectHandler?.();
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeout);
        this.isConnected = false;
        this.logger.debug(`Watcher client error: ${err.message}`);
        reject(err);
      });
    });
  }

  /**
   * Handle incoming data from the daemon
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete messages (newline-delimited JSON)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message: WatcherMessage = JSON.parse(line);
        this.handleMessage(message);
      } catch (err: any) {
        this.logger.debug(`Failed to parse message: ${err.message}`);
      }
    }
  }

  /**
   * Handle a parsed message from the daemon
   */
  private handleMessage(message: WatcherMessage): void {
    switch (message.type) {
      case 'events':
        this.eventsHandler?.(message.events);
        break;
      case 'error':
        this.errorHandler?.(message);
        break;
      case 'ready':
        this.readyHandler?.();
        break;
      case 'heartbeat':
        // Just a keep-alive, no action needed
        break;
    }
  }

  /**
   * Register handler for file system events
   */
  onEvents(handler: (events: Event[]) => void): void {
    this.eventsHandler = handler;
  }

  /**
   * Register handler for errors
   */
  onError(handler: (error: WatcherError) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Register handler for ready signal
   */
  onReady(handler: () => void): void {
    this.readyHandler = handler;
  }

  /**
   * Register handler for disconnection
   */
  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  /**
   * Check if connected to daemon
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Disconnect from the daemon
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
  }
}

/**
 * Get or create a watcher connection for the given workspace.
 * Returns either a daemon (if we're the first) or a client (if daemon exists).
 */
export async function getOrCreateWatcherConnection(
  scopePath: string,
  logger: Logger
): Promise<{ isDaemon: boolean; daemon?: WatcherDaemon; client?: WatcherClient }> {
  // Check if daemon is already running
  const isRunning = await WatcherDaemon.isRunning(scopePath);

  if (isRunning) {
    // Connect as client
    const client = new WatcherClient(scopePath, logger);
    await client.connect();
    return { isDaemon: false, client };
  }

  // Become the daemon
  const daemon = new WatcherDaemon(scopePath, logger);
  await daemon.start();
  return { isDaemon: true, daemon };
}
