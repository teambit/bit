import c from 'chalk';

export const formatPlainComponentItem = ({ scope, name, version, deprecated }: any) =>
  c.cyan(
    `- ${scope ? `${scope}/` : ''}${name}@${version ? version.toString() : 'latest'}  ${
      deprecated ? c.yellow('[deprecated]') : ''
    }`
  );

export const paintHeader = (value: string) => {
  if (!value) return '';
  return `${c.underline(value)}\n`;
};
