import { CLIMain } from '@teambit/cli';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { addClient, removeClient } from '@teambit/harmony.modules.send-server-sent-events';

type CLIENT = {
  id: number;
  response: Response;
};

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

      const newClient: CLIENT = {
        id: clientId,
        response,
      };

      addClient(newClient);

      request.on('close', () => {
        this.logger.debug(`${clientId} SSE Connection closed`);
        removeClient(newClient);
      });
    },
  ];
}
