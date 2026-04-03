import chalk from 'chalk';
import { platform } from 'os';

/** Cross-platform green checkmark (mirrors Logger.successSymbol without importing Logger to avoid coupling) */
const _successSymbol = platform() === 'win32' ? chalk.green('\u2713') : chalk.green('\u2714');
export function successSymbol(): string {
  return _successSymbol;
}

/** Yellow warning symbol */
export const warnSymbol = chalk.yellow('\u26A0');

/** Red error symbol */
export const errorSymbol = chalk.red('\u2716');

/** Neutral bullet for informational items (no success/failure connotation) */
export const bulletSymbol = chalk.dim('\u203A');

/** Format a single item with 3-space indent + symbol + text. Defaults to bullet symbol. */
export function formatItem(text: string, symbol?: string): string {
  const s = symbol ?? bulletSymbol;
  return `   ${s} ${text}`;
}

/**
 * Format a section with bold white title (including item count), dim description, and items.
 * Returns empty string if items array is empty.
 */
export function formatSection(title: string, description: string, items: string[]): string {
  if (!items.length) return '';
  const lines: string[] = [formatTitle(`${title} (${items.length})`)];
  if (description) {
    const indented = description
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n');
    lines.push(chalk.dim(indented));
  }
  lines.push(...items);
  return lines.join('\n');
}

/** Format a bold white section title */
export function formatTitle(text: string): string {
  return chalk.bold.white(text);
}

/** Format hint text in dim color */
export function formatHint(text: string): string {
  return chalk.dim(text);
}

/** Format a success summary: green checkmark + green message */
export function formatSuccessSummary(msg: string): string {
  return `${successSymbol()} ${chalk.green(msg)}`;
}

/** Format a warning summary: warning symbol + yellow message */
export function formatWarningSummary(msg: string): string {
  return `${warnSymbol} ${chalk.yellow(msg)}`;
}

/** Filter out empty strings and join remaining sections with double newlines */
export function joinSections(sections: string[]): string {
  return sections.filter(Boolean).join('\n\n');
}

export interface OutputSection {
  /** The fully rendered section text */
  content: string;
  /** If set, this section starts collapsed. Use --expand to show full content. */
  collapsible?: {
    /** Summary line shown when collapsed */
    summary: string;
  };
}

/**
 * Render sections to a string, collapsing sections that are marked collapsible.
 * When expand is true, all sections are shown expanded.
 */
export function renderSections(sections: OutputSection[], expand = false): string {
  const parts: string[] = [];
  for (const section of sections) {
    if (section.collapsible && !expand) {
      parts.push(section.collapsible.summary);
    } else if (section.content) {
      parts.push(section.content);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}
