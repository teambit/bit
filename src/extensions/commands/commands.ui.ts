export type CommandHandler = (...arg: any[]) => any;
export type CommandEntry = {
  name: string;
  description?: string;
  handler: CommandHandler;
};
export type CommandId = string;
export type CommandObj = CommandEntry & { id: CommandId };

export default class CommandRegistryUi extends Map<CommandId, CommandEntry> {
  static dependencies = [];
  static slots = [];
  static async provider(/* deps: []] config, slots: [] */) {
    const CommandRegistry = new CommandRegistryUi();
    return CommandRegistry;
  }

  run<R = any>(id: CommandId, ...rest: any[]) {
    const command = this.get(id);
    if (!command) return undefined;

    const result = command.handler(...rest);
    return result as R;
  }

  clear() {
    this._asList = undefined;
    return super.clear();
  }
  delete(key: CommandId) {
    this._asList = undefined;
    return super.delete(key);
  }
  set(key: CommandId, value: CommandEntry) {
    this._asList = undefined;
    return super.set(key, value);
  }

  // cached, to avoid re-creating array each time
  private _asList?: CommandObj[] = undefined;
  list = () => {
    this._asList = this._asList || Array.from(this.entries()).map(([id, entry]) => ({ id, ...entry }));
    return this._asList;
  };
}
