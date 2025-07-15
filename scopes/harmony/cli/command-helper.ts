import { Command } from './command';
import { camelCase } from 'lodash';

type ArgData = {
  /**
   * as it appears in the command name, e.g. "component-pattern..."
   */
  nameRaw: string;
  /**
   * to make it valid as a js variable name, e.g. "componentPattern"
   */
  nameCamelCase: string;
  required: boolean;
  description?: string;
  isArray?: boolean;
};

export function getArgsData(cmd: Command): ArgData[] {
  const commandSplit = cmd.name.split(' ');
  commandSplit.shift(); // remove the first element, it's the command-name

  return commandSplit.map((existArg) => {
    const trimmed = existArg.trim();
    if ((!trimmed.startsWith('<') && !trimmed.startsWith('[')) || (!trimmed.endsWith('>') && !trimmed.endsWith(']'))) {
      throw new Error(`expect arg "${trimmed}" of "${cmd.name}" to be wrapped with "[]" or "<>"`);
    }
    // remove the opening and closing brackets
    const withoutBrackets = trimmed.slice(1, -1);
    const foundInArguments = cmd.arguments?.find((arg) => arg.name === withoutBrackets);

    return {
      nameRaw: withoutBrackets,
      nameCamelCase: camelCase(withoutBrackets), // it also removes the "..." if exists
      required: trimmed.startsWith('<'),
      description: foundInArguments?.description,
      isArray: withoutBrackets.endsWith('...'),
    };
  });
}

type FlagData = {
  name: string;
  alias?: string;
  description: string;
  type: 'string' | 'boolean';
  requiresArg: boolean; // a value is required after the flag. e.g. 'message <message>'
};

export function getFlagsData(cmd: Command): FlagData[] {
  const options = cmd.options;
  if (!options) return [];
  return options.map((opt) => {
    const [alias, flag, description] = opt;
    const name = flag.split(' ')[0];
    const type = flag.includes('<') || flag.includes('[') ? 'string' : 'boolean';
    const requiresArg = flag.includes('<');

    return {
      name,
      alias,
      description,
      type,
      requiresArg,
    };
  });
}

export function getCommandName(cmd: Command): string {
  return cmd.name.split(' ')[0];
}
