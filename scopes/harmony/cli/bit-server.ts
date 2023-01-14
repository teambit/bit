import { Logger } from '@teambit/logger';
import express from 'express';
import { CLIMain } from './cli.main.runtime';

export async function runBitServer(cli: CLIMain, logger: Logger, options: { port: number }) {
  const app = express();
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/cli/:cmd', async (req, res, next) => {
    logger.debug(`cli server: got request for ${req.params.cmd}`);
    try {
      const command = cli.getCommand(req.params.cmd);
      if (!command) throw new Error(`command "${req.params.cmd}" was not found`);
      if (!command.json) throw new Error(`command "${req.params.cmd}" does not have a json method`);
      const result = await command?.json([], {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return new Promise(() => {
    const port = options.port || 3000;
    app.listen(port, () => {
      logger.console(`Bit Server is listening on port ${port}`);
    });
  });
}
