import chalk from 'chalk';
import type { EnvConfigWritersList } from '../workspace-config-files.main.runtime';
import type { ConfigWriterEntry } from '../config-writer-entry';

export function formatListOutput(result: EnvConfigWritersList): string {
  return Object.values(result)
    .map((item) => getEnvOutput(item.envId, item.configWriters))
    .join('\n\n');
}

function getEnvOutput(envId: string, configWriters: ConfigWriterEntry[]): string {
  const title = chalk.bold(envId);
  const space = '  ';
  if (!configWriters.length) return `${title}\n${space}${chalk.yellow('no config writers found')}`;
  const entries = configWriters
    .map((configWriter) => {
      return `${configWriter.name} (${configWriter.id})`;
    })
    .join(`\n${space}`);
  return `${title}\n${space}${entries}`;
}
