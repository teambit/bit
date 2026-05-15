import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import { logger as legacyLogger } from '@teambit/legacy.logger';
import type { CLIArgs, Flags, Command, CommandDescriptor, CommandFactory } from './command';
import pMapSeries from 'p-map-series';
import type { GroupsType } from './command-groups';
import { groups } from './command-groups';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { clone } from 'lodash';
import { CLIAspect, MainRuntime } from './cli.aspect';
import { getCommandId } from './get-command-id';
import { CLIParser, findCommandByArgv } from './cli-parser';
import { CompletionCmd } from './completion.cmd';
import { CliCmd, CliGenerateCmd } from './cli.cmd';
import { HelpCmd } from './help.cmd';
import { VersionCmd } from './version.cmd';
import { DetailsCmd } from './details.cmd';
import { completionCommand, detailsCommand, versionCommand } from './cli.commands';

export type CommandList = Array<Command>;
export type OnStart = (hasWorkspace: boolean, currentCommand: string, commandObject?: Command) => Promise<void>;
export type OnCommandStart = (commandName: string, args: CLIArgs, flags: Flags) => Promise<void>;
export type OnBeforeExitFn = () => Promise<void>;

export type OnStartSlot = SlotRegistry<OnStart>;
export type OnCommandStartSlot = SlotRegistry<OnCommandStart>;
export type CommandsSlot = SlotRegistry<CommandList>;
export type OnBeforeExitSlot = SlotRegistry<OnBeforeExitFn>;

export class CLIMain {
  public groups: GroupsType = clone(groups); // if it's not cloned, it is cached across loadBit() instances
  private lazyHarmony: { resolve: (id: string) => Promise<unknown> } | undefined;
  constructor(
    private commandsSlot: CommandsSlot,
    private onStartSlot: OnStartSlot,
    readonly onCommandStartSlot: OnCommandStartSlot,
    private onBeforeExitSlot: OnBeforeExitSlot,
    private logger: Logger
  ) {}

  /**
   * registers a new command in to the CLI.
   *
   * Two forms are supported:
   *   - Legacy: `cli.register(cmd1, cmd2, ...)` — variadic `Command` instances.
   *   - Descriptor + factory (RFC §6.2): `cli.register(descriptor, factory)` —
   *     the descriptor carries the static fields; the factory produces the
   *     runnable handler. For now the factory is invoked immediately so
   *     downstream behaviour is unchanged; in later slices the dispatcher
   *     defers the call until the command is actually run.
   */
  register(...commands: CommandList): void;
  register(descriptor: CommandDescriptor, factory: CommandFactory): void;
  register(...args: unknown[]): void {
    if (args.length === 2 && typeof args[1] === 'function') {
      const factory = args[1] as CommandFactory;
      const command = factory();
      this.setDefaults(command);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      command.commands!.forEach((cmd) => this.setDefaults(cmd));
      this.appendToSlot([command]);
      return;
    }
    const commands = args as CommandList;
    commands.forEach((command) => {
      this.setDefaults(command);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      command.commands!.forEach((cmd) => this.setDefaults(cmd));
    });
    this.appendToSlot(commands);
  }

  // The underlying Slot stores one entry per aspect (keyed by harmony.current).
  // `slot.register(value)` overwrites that entry, so two `cli.register` calls from
  // the same provider would drop the first registration. We snapshot the slot
  // before delegating, then merge any pre-existing commands back in.
  private appendToSlot(commands: CommandList): void {
    const before = new Map(this.commandsSlot.map);
    this.commandsSlot.register(commands);
    for (const [id, post] of this.commandsSlot.map) {
      const prev = before.get(id);
      if (prev === post) continue;
      if (prev && prev.length > 0) {
        this.commandsSlot.map.set(id, [...prev, ...post]);
      }
      return;
    }
  }

  /**
   * helpful for having the same command name in different environments (e.g. legacy and non-legacy).
   * for example `cli.unregister('tag');` removes the "bit tag" command.
   */
  unregister(commandName: string) {
    this.commandsSlot.toArray().forEach(([aspectId, commands]) => {
      const filteredCommands = commands.filter((command) => {
        return getCommandId(command.name) !== commandName;
      });
      this.commandsSlot.map.set(aspectId, filteredCommands);
    });
  }

  /**
   * list of all registered commands. (legacy and new).
   */
  get commands(): CommandList {
    return this.commandsSlot.values().flat();
  }

  /**
   * Pairs of (aspectId, commands) as registered in the commands slot.
   * Used by the codegen script (`scripts/generate-command-index.mjs`) and the
   * load-bit assertion that the generated command index matches live state.
   * See docs/rfc-esm-lazy-aspects.md, Slice 2.
   */
  commandsByAspect(): Array<[string, CommandList]> {
    return this.commandsSlot.toArray();
  }

  /**
   * get an instance of a registered command. (useful for aspects to modify and extend existing commands)
   */
  getCommand(name: string): Command | undefined {
    return this.commands.find((command) => getCommandId(command.name) === name);
  }

  getCommandByNameOrAlias(name: string): Command | undefined {
    const command = this.getCommand(name);
    if (command) return command;
    return this.commands.find((cmd) => cmd.alias === name);
  }

  /**
   * when running `bit help`, commands are grouped by categories.
   * this method helps registering a new group by providing its name and a description.
   * the name is what needs to be assigned to the `group` property of the Command interface.
   * the description is what shown in the `bit help` output.
   */
  registerGroup(name: string, description: string) {
    if (this.groups[name]) {
      this.logger.consoleWarning(`CLI group "${name}" is already registered`);
    } else {
      this.groups[name] = description;
    }
  }

  /**
   * onStart is when bootstrapping the CLI. (it happens before onCommandStart)
   */
  registerOnStart(onStartFn: OnStart) {
    this.onStartSlot.register(onStartFn);
    return this;
  }

  /**
   * onCommandStart is when a command is about to start and we have the command object and the parsed args and flags
   * already. (it happens after onStart)
   */
  registerOnCommandStart(onCommandStartFn: OnCommandStart) {
    this.onCommandStartSlot.register(onCommandStartFn);
    return this;
  }

  /**
   * This will register a function to be called before the process exits.
   * This will run only for "regular" exits
   * e.g.
   * yes - command run and finished successfully
   * yes - command run and failed gracefully (code 1)
   * not SIGKILL (kill -9)
   * not SIGINT (Ctrl+C)
   * not SIGTERM (kill)
   * not uncaughtException
   * not unhandledRejection
   *
   * @param onBeforeExitFn
   * @returns
   */
  registerOnBeforeExit(onBeforeExitFn: OnBeforeExitFn) {
    this.onBeforeExitSlot.register(onBeforeExitFn);
    legacyLogger.registerOnBeforeExitFn(onBeforeExitFn);
    return this;
  }

  /**
   * execute commands registered to this aspect.
   */
  async run(hasWorkspace: boolean) {
    // Lazy bootstrap: if the entered command is still a stub (its owning
    // aspect's provider hasn't run yet), resolve that aspect now so yargs
    // sees the real Command — with full options, args, and sub-commands.
    await this.resolveEnteredCommand();
    await this.invokeOnStart(hasWorkspace);
    const CliParser = new CLIParser(this.commands, this.groups, this.onCommandStartSlot);
    const commandRunner = await CliParser.parse();
    await commandRunner.runCommand();
  }

  private async resolveEnteredCommand(): Promise<void> {
    if (!this.lazyHarmony) return;
    const argv = process.argv.slice(2);
    const name = argv.find((a) => !a.startsWith('-'));
    if (!name) return;
    const match = this.commands.find((c) => {
      const n = getCommandId(c.name);
      return n === name || c.alias === name;
    });
    if (!match) return;
    const aspectId = (match as any).aspectId;
    if (!aspectId) return; // real command already, not a stub
    // Only stubs carry `aspectId`. Resolve to get the real command in place.
    await this.lazyHarmony.resolve(aspectId);
    // Drop any leftover stubs for this aspect (the resolved provider has
    // registered the real ones with the same name; stubs would shadow them
    // when `this.commands` returns the slot's flat values).
    const after = (this.commandsSlot.map.get(aspectId) || []).filter(
      (c: any) => !c.aspectId, // stubs are tagged with `aspectId`
    );
    this.commandsSlot.map.set(aspectId, after);
  }

  /**
   * Lazy bootstrap (RFC §6.5). Seed `commandsSlot` with stub Command
   * objects read from `command-index.generated.ts` so cli.run() can
   * match argv before any aspect provider has run. Each stub's handler
   * resolves the owning aspect via Harmony.resolve, then delegates to
   * the real handler the aspect's provider just registered.
   */
  registerLazyStubs(harmony: { resolve: (id: string) => Promise<unknown> }): void {
    this.lazyHarmony = harmony;
    // Lazy require to avoid circular dep with @teambit/bit.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const { COMMAND_INDEX } = require('@teambit/bit/dist/command-index.generated.js');
    for (const entry of COMMAND_INDEX as Array<any>) {
      const stub = this.makeLazyStub(entry, harmony);
      // Bypass the slot accumulator — we know each stub is from a distinct
      // aspect id, and we want it keyed by that aspect, not by `harmony.current`.
      const existing = this.commandsSlot.map.get(entry.aspectId) || [];
      this.commandsSlot.map.set(entry.aspectId, [...existing, stub]);
    }
  }

  private makeLazyStub(entry: any, harmony: { resolve: (id: string) => Promise<unknown> }): Command {
    const subCommands = Array.isArray(entry.subCommands) ? entry.subCommands : [];
    const slot = this.commandsSlot;
    const self = this;
    const stub: any = {
      name: entry.name,
      description: entry.description ?? '',
      extendedDescription: '',
      group: entry.group ?? 'ungrouped',
      options: [],
      commands: subCommands.map((s: any) => this.makeLazyStub(s, harmony)),
      private: entry.private ?? false,
      alias: entry.alias ?? '',
      loader: entry.loader !== false,
      loadAspects: entry.loadAspects !== false,
      remoteOp: entry.remoteOp ?? false,
      skipWorkspace: entry.skipWorkspace ?? false,
      helpUrl: undefined,
      aspectId: entry.aspectId,
    };

    async function trampoline(method: 'report' | 'json' | 'wait', args: unknown[]): Promise<unknown> {
      // Remove the stub so the real Command (just registered by the
      // resolved aspect's provider) takes over.
      const before = slot.map.get(entry.aspectId) || [];
      slot.map.set(entry.aspectId, before.filter((c: any) => c !== stub));
      await harmony.resolve(entry.aspectId);
      const real = self.getCommand(entry.name);
      if (!real) throw new Error(`lazy dispatch: no command "${entry.name}" after resolving ${entry.aspectId}`);
      const fn = (real as any)[method];
      if (typeof fn !== 'function') {
        throw new Error(`command "${entry.name}" has no .${method} handler`);
      }
      return fn.apply(real, args);
    }
    stub.report = (...args: unknown[]) => trampoline('report', args);
    stub.json = (...args: unknown[]) => trampoline('json', args);
    stub.wait = (...args: unknown[]) => trampoline('wait', args);
    return stub as Command;
  }

  private async invokeOnStart(hasWorkspace: boolean) {
    const onStartFns = this.onStartSlot.values();
    const foundCmd = findCommandByArgv(this.commands);
    const currentCommandName = process.argv[2];
    await pMapSeries(onStartFns, (onStart) => onStart(hasWorkspace, currentCommandName, foundCmd));
  }

  private setDefaults(command: Command) {
    command.alias = command.alias || '';
    command.description = command.description || '';
    command.extendedDescription = command.extendedDescription || '';
    command.group = command.group || 'ungrouped';
    command.options = command.options || [];
    command.private = command.private || false;
    command.commands = command.commands || [];
    command.name = command.name.trim();
    if (command.loader === undefined) {
      command.loader = true;
    }
    if (command.loadAspects === undefined) {
      command.loadAspects = true;
    }
    if (command.helpUrl && !isFullUrl(command.helpUrl)) {
      command.helpUrl = `https://bit.dev/${command.helpUrl}`;
    }
  }

  static dependencies = [LoggerAspect];
  static runtime = MainRuntime;
  static slots = [
    Slot.withType<CommandList>(),
    Slot.withType<OnStart>(),
    Slot.withType<OnCommandStart>(),
    Slot.withType<OnBeforeExitFn>(),
  ];

  static async provider(
    [loggerMain]: [LoggerMain],
    config,
    [commandsSlot, onStartSlot, onCommandStartSlot, onBeforeExitSlot]: [
      CommandsSlot,
      OnStartSlot,
      OnCommandStartSlot,
      OnBeforeExitSlot,
    ]
  ) {
    const logger = loggerMain.createLogger(CLIAspect.id);
    const cliMain = new CLIMain(commandsSlot, onStartSlot, onCommandStartSlot, onBeforeExitSlot, logger);
    const cliGenerateCmd = new CliGenerateCmd(cliMain);
    const cliCmd = new CliCmd(cliMain);
    const helpCmd = new HelpCmd(cliMain);
    cliCmd.commands.push(cliGenerateCmd);
    cliMain.register(completionCommand, () => new CompletionCmd());
    cliMain.register(versionCommand, () => new VersionCmd());
    cliMain.register(detailsCommand, () => new DetailsCmd());
    return cliMain;
  }
}

CLIAspect.addRuntime(CLIMain);

function isFullUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://');
}
