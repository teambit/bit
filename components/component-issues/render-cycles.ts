import chalk from 'chalk';

const MAX_HORIZONTAL_WIDTH = 90;
const ARROW = '  ───>  ';
const ARROW_LEN = 8;

type ShortenedInfo = {
  names: string[];
  scope: string | undefined;
  version: string | undefined;
};

function shortenNames(cycle: string[]): ShortenedInfo {
  // cycle has the first element duplicated at the end; work with unique entries
  const unique = cycle.slice(0, -1);

  // extract scope: everything up to and including the last '/' before the component name
  // e.g. "my-org.scope/ui/button@0.0.1" → scope "my-org.scope/ui", name "button", ver "0.0.1"
  const parsed = unique.map((id) => {
    const atIdx = id.lastIndexOf('@');
    const version = atIdx > 0 ? id.slice(atIdx + 1) : undefined;
    const withoutVer = atIdx > 0 ? id.slice(0, atIdx) : id;
    const slashIdx = withoutVer.lastIndexOf('/');
    const scope = slashIdx > 0 ? withoutVer.slice(0, slashIdx) : undefined;
    const name = slashIdx > 0 ? withoutVer.slice(slashIdx + 1) : withoutVer;
    return { scope, name, version };
  });

  // common scope: only if ALL entries share the same scope
  const scopes = new Set(parsed.map((p) => p.scope));
  const commonScope = scopes.size === 1 ? parsed[0].scope : undefined;

  // common version: only if ALL entries share the same version
  const versions = new Set(parsed.map((p) => p.version));
  const commonVersion = versions.size === 1 ? parsed[0].version : undefined;

  const names = parsed.map((p) => {
    let display = commonScope ? p.name : p.scope ? `${p.scope}/${p.name}` : p.name;
    if (!commonVersion && p.version) {
      display += `@${p.version}`;
    }
    return display;
  });

  return { names, scope: commonScope, version: commonVersion };
}

function renderHeader(
  cycleIndex: number | undefined,
  totalCycles: number,
  componentCount: number,
  scope: string | undefined,
  version: string | undefined
): string {
  const isSelf = componentCount === 1;
  let header = '';

  if (totalCycles > 1 && cycleIndex !== undefined) {
    header += `Cycle ${cycleIndex + 1} of ${totalCycles}`;
  } else {
    header += 'Cycle';
  }

  header += isSelf ? ' - self-dependency' : ` - ${componentCount} components`;

  if (scope) header += `   (scope: ${scope})`;
  if (version) header += `  @${version}`;

  return chalk.bold(header);
}

function renderSelfCycle(name: string): string {
  return `  ${chalk.cyan(name)}  ⟲`;
}

function renderHorizontal(names: string[]): string {
  // build chain: name0  ───>  name1  ───>  name2
  const chainParts: string[] = [];
  const plainParts: string[] = [];
  for (let i = 0; i < names.length; i++) {
    chainParts.push(chalk.cyan(names[i]));
    plainParts.push(names[i]);
    if (i < names.length - 1) {
      chainParts.push(chalk.dim(ARROW));
      plainParts.push(ARROW);
    }
  }

  const chainStr = chainParts.join('');
  const plainLen = plainParts.join('').length;

  // the last segment connects to the closing edge: ───┘
  const closingSuffix = chalk.red('  ───┘');
  const closingSuffixLen = 6; // "  ───┘"

  const totalWidth = plainLen + closingSuffixLen;

  // top bar spans from above ▼ (column 0) to the ┐ (at totalWidth - 1)
  const topBar = chalk.red('┌') + chalk.red('─'.repeat(totalWidth - 2)) + chalk.red('┐');
  const sideLine = ' '.repeat(totalWidth - 1) + chalk.red('│');
  const entryArrow = chalk.red('▼') + ' '.repeat(totalWidth - 2) + chalk.red('│');

  const lines = [topBar, sideLine, entryArrow, chainStr + closingSuffix];
  return lines.join('\n');
}

function renderVertical(names: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < names.length; i++) {
    lines.push(chalk.cyan(names[i]));
    if (i < names.length - 1) {
      lines.push(chalk.dim('  │'));
      lines.push(chalk.dim('  ▼'));
    }
  }
  // back-edge to start
  lines.push(chalk.red(`  ╰───▶ `) + chalk.cyan(names[0]) + chalk.dim('  (back to start)'));
  return lines.join('\n');
}

/**
 * Render an array of cycles (each cycle is an array of component-id strings with the
 * first element duplicated at the end) into a human-readable string with ASCII diagrams.
 */
export function renderCycles(cycles: string[][]): string {
  if (!cycles.length) {
    return 'No circular dependencies found';
  }
  const totalCycles = cycles.length;
  const blocks = cycles.map((cycle, idx) => {
    const componentCount = cycle.length - 1; // last entry is duplicate of first
    const { names, scope, version } = shortenNames(cycle);
    const cycleIndex = totalCycles > 1 ? idx : undefined;
    const header = renderHeader(cycleIndex, totalCycles, componentCount, scope, version);

    let body: string;
    if (componentCount === 1) {
      body = renderSelfCycle(names[0]);
    } else {
      const chainPlainLen = names.reduce((sum, n) => sum + n.length, 0) + (names.length - 1) * ARROW_LEN;
      const horizontalWidth = chainPlainLen + 6; // + closing "  ───┘"
      if (horizontalWidth <= MAX_HORIZONTAL_WIDTH) {
        body = renderHorizontal(names);
      } else {
        body = renderVertical(names);
      }
    }

    return `${header}\n\n${body}`;
  });

  return '\n' + blocks.join('\n\n') + '\n';
}
