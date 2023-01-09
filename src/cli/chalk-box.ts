import c from 'chalk';

export const formatNewBit = ({ name }: any): string => c.white('     > ') + c.cyan(name);

export const formatBit = ({ scope, name, version }: any) =>
  c.white('     > ') + c.cyan(`${scope ? `${scope}/` : ''}${name} - ${version ? version.toString() : 'latest'}`);

export const formatPlainComponentItem = ({ scope, name, version, deprecated }: any) =>
  c.cyan(
    `- ${scope ? `${scope}/` : ''}${name}@${version ? version.toString() : 'latest'}  ${
      deprecated ? c.yellow('[deprecated]') : ''
    }`
  );

export const formatBitString = (bit: string): string => c.white('     > ') + c.cyan(`${bit}`);

export const paintBitProp = (key: string, value: string) => {
  if (!value) return '';
  return `${c.magenta(key)} -> ${value}\n`;
};

export const paintHeader = (value: string) => {
  if (!value) return '';
  return `${c.underline(value)}\n`;
};
