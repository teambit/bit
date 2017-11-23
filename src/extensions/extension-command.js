/** @flow */
import Command from '../cli/command';

type ExtensionCommandProps = {
  name: string,
  action: Function,
  description: string,
  opts?: [string, string, string][]
};

export default class ExtensionCommand extends Command {
  name = '';
  description = '';
  opts = [];

  private = false;
  migration = false;
  extension = true;
  loader = true;

  constructor(props: ExtensionCommandProps) {
    super();
    this.name = props.name;
    this.description = props.description;
    this.action = props.action;
    this.opts = props.opts || [];
  }
}
