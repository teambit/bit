import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import type { Command, CommandOptions } from './command';
import { formatTitle, formatHint } from './output-formatter';
import { LAST_COMMAND_DETAILS_DIR } from './command-runner';

export class DetailsCmd implements Command {
  name = 'details';
  description = 'show detailed output from the last command';
  alias = '';
  group = 'general';
  options = [] as CommandOptions;
  loader = false;
  loadAspects = false;
  skipWorkspace = true;

  async report() {
    const contentPath = path.join(LAST_COMMAND_DETAILS_DIR, 'content');
    const metaPath = path.join(LAST_COMMAND_DETAILS_DIR, 'meta.json');

    const exists = await fs.pathExists(contentPath);
    if (!exists) {
      return chalk.yellow('no details available. run a command like "bit tag" or "bit snap" first.');
    }

    const [content, metaRaw] = await Promise.all([
      fs.readFile(contentPath, 'utf-8'),
      fs.readFile(metaPath, 'utf-8').catch(() => '{}'),
    ]);

    let meta: Record<string, string> = {};
    try {
      meta = JSON.parse(metaRaw);
    } catch {
      // corrupted meta file, proceed with empty meta
    }
    const timestamp = meta.timestamp && !Number.isNaN(Date.parse(meta.timestamp)) ? meta.timestamp : '';
    const header = meta.command
      ? formatTitle(`details from "bit ${meta.command}"`) + (timestamp ? chalk.dim(`  ${timestamp}`) : '')
      : formatTitle('details from last command');

    return `${header}\n\n${content}\n\n${formatHint('(these are details from the last command that provided them)')}`;
  }
}
