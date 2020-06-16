import { LegacyCommand, CommandOptions } from '../cli/legacy-command';

type ExtensionCommandProps = {
  name: string;
  action: Function;
  report: Function;
  description: string;
  opts?: CommandOptions;
};

export default class ExtensionCommand implements LegacyCommand {
  name = '';
  description = '';
  alias = '';
  opts: CommandOptions = [];

  private = false;
  migration = false;
  extension = true;
  loader = true;
  _action;
  _report;

  constructor(props: ExtensionCommandProps) {
    this.name = props.name;
    this.description = props.description;
    this._action = props.action;
    this._report = props.report;
    this.opts = props.opts || [];
  }

  // A wrapper to make sure the action return a promise
  action(relevantArgs, opts): Promise<any> {
    return Promise.resolve(this._action(relevantArgs, opts));
  }

  report(data: any): string {
    if (this._report && typeof this._report === 'function') {
      return this._report(data);
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return super.report();
  }
}
