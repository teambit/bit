import chalk from 'chalk';
import { platform } from 'os';

/** Cross-platform green checkmark (mirrors Logger.successSymbol without importing Logger to avoid coupling) */
export function successSymbol(): string {
  return platform() === 'win32' ? chalk.green('\u2713') : chalk.green('\u2714');
}

/** Yellow warning symbol */
export const warnSymbol = chalk.yellow('\u26A0');

/** Red error symbol */
export const errorSymbol = chalk.red('\u2716');

/** Format a single item with 3-space indent + symbol + text. Defaults to success symbol. */
export function formatItem(text: string, symbol?: string): string {
  const s = symbol ?? successSymbol();
  return `   ${s} ${text}`;
}

/**
 * Format a section with bold white title (including item count), dim description, and items.
 * Returns empty string if items array is empty.
 */
export function formatSection(title: string, description: string, items: string[]): string {
  if (!items.length) return '';
  const titleOutput = chalk.bold.white(`${title} (${items.length})`);
  const descOutput = description ? `${chalk.dim(description)}\n` : '';
  return [titleOutput, descOutput, ...items].join('\n');
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
