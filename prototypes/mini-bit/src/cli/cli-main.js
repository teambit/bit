import { COMMAND_INDEX, ALL_DESCRIPTORS } from '../command-index.generated.js';
import { trace } from '../harmony/tracer.js';

// Dispatch flow:
//   1. argv[0] → COMMAND_INDEX[name].aspectId
//   2. harmony.resolve(aspectId) — triggers lazy load of just that subtree
//   3. The resolved provider has called cli.register(...) with its handler
//   4. Look up the registered command and invoke its handler
export class CLIMain {
  constructor(harmony) {
    this.harmony = harmony;
    this.commands = new Map();
  }

  // Aspects call this from their provider() with descriptor + handler merged.
  register(command) {
    this.commands.set(command.name, command);
    if (command.alias) this.commands.set(command.alias, command);
  }

  async run(argv) {
    const cmdName = argv[0];

    // Fast paths that need zero aspect loads beyond CLI itself.
    if (!cmdName || cmdName === '--help' || cmdName === '-h') return this.printHelp();
    if (cmdName === '--version' || cmdName === '-v') {
      process.stdout.write('mini-bit 0.1.0\n');
      return;
    }

    const entry = COMMAND_INDEX[cmdName];
    if (!entry) {
      process.stderr.write(`unknown command: ${cmdName}\n`);
      this.printHelp();
      process.exit(1);
    }

    // The actual lazy-load trigger.
    trace(`dispatch ${cmdName} → resolve ${entry.aspectId}`);
    await this.harmony.resolve(entry.aspectId);

    const cmd = this.commands.get(cmdName);
    if (!cmd) throw new Error(`Command ${cmdName} not registered by ${entry.aspectId}`);

    const result = await cmd.report(argv.slice(1), {});
    if (result) process.stdout.write(result + '\n');
  }

  printHelp() {
    const lines = [
      'mini-bit — prototype of lazy-loaded Bit aspects',
      '',
      'Commands:',
    ];
    for (const d of ALL_DESCRIPTORS) {
      const aliasStr = d.alias ? `, ${d.alias}` : '';
      lines.push(`  ${d.name}${aliasStr.padEnd(6)}  ${d.description}`);
    }
    lines.push('');
    lines.push('Flags:');
    lines.push('  --version, -v   Print version');
    lines.push('  --help, -h      This help');
    lines.push('');
    lines.push('Env:');
    lines.push('  BIT_TRACE_ASPECT_LOAD=1  Trace aspect loads');
    lines.push('  BIT_EAGER=1              Eager-load mode (compare to lazy)');
    process.stdout.write(lines.join('\n') + '\n');
  }
}
