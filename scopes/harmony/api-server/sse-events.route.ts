import { CLIMain } from '@teambit/cli';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';

type CLIENT = {
  id: number;
  response: Response;
};

let clients: CLIENT[] = [];

type EventName = 'onComponentChange' | 'onBitmapChange' | 'onWorkspaceConfigChange' | 'onPostInstall';

export function sendEventsToClients(eventName: EventName, data: any) {
  clients.forEach((client) => client.response.write(`event:${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
}

/**
 * Server-Sent Events (SSE).
 */
export class SSEEventsRoute implements Route {
  constructor(private logger: Logger, private cli: CLIMain) {}

  method = 'get';
  route = '/sse-events';

  middlewares = [
    async (request: Request, response: Response) => {
      this.logger.debug(`sse-events: got request for ${request.params}`);
      const headers = {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      };
      response.writeHead(200, headers);

      const clientId = Date.now();

      const newClient = {
        id: clientId,
        response,
      };

      clients.push(newClient);

      request.on('close', () => {
        this.logger.debug(`${clientId} SSE Connection closed`);
        clients = clients.filter((client) => client.id !== clientId);
      });
    },
  ];
}
