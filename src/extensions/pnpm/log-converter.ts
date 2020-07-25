import { LogBase } from '@pnpm/logger';
import { LogPublisher } from '../logger';

export function logConverter(logger: LogPublisher) {
  return (log: LogBase) => {
    // TODO: think whether to use this or delegate output to the package manager.
    if (log.level === 'debug') logger.debug(undefined, log.toString());
    if (log.level === 'warn') logger.warn(undefined, log.toString());
    if (log.level === 'debug') logger.debug(undefined, log.toString());
    if (log.level === 'error') logger.error(undefined, log.toString());
  };
}
