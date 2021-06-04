import chalk from 'chalk';

type LinkRowProps = {
  title: string;
  target: string;
  padding?: number;
};
export function LinkRow({ title, target, padding = 50 }: LinkRowProps) {
  return chalk.bold(`${title.padEnd(padding)} ${'>'} ${target}`);
}

type VerboseLinkRowProps = {
  from: string;
  to: string;
};
export function VerboseLinkRow({ from, to }: VerboseLinkRowProps) {
  return `${chalk.bold('from')}: ${from}
${chalk.bold('to')}: ${to}
`;
}
