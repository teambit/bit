import { LogBase } from '@pnpm/logger';
import { Logger } from '@teambit/logger';

export function logConverter(logger: Logger) {
  return (log: LogBase) => {
    // TODO: think whether to use this or delegate output to the package manager.
    if (log.level === 'debug') logger.debug(log.toString());
    if (log.level === 'warn') logger.warn(log.toString());
    if (log.level === 'debug') logger.debug(log.toString());
    if (log.level === 'error') logger.error(log.toString());
  };
}
