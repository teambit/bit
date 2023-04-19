import chalk from 'chalk';

export const UNABLE_TO_LOAD_EXTENSION = (id: string, errMsg?: string) =>
  `error: Bit received an error loading "${id}", due to the error "${
    errMsg || '<unknown-error>'
  }", please use the '--log=error' flag for the full error.`;
export const UNABLE_TO_LOAD_EXTENSION_FROM_LIST = (ids: string[], errMsg?: string, neededFor?: string) => {
  // const installOutput = err?.code === 'MODULE_NOT_FOUND' ? `try running "bit install" to install the missing dependencies` : '';
  const installOutput = `try running ${chalk.cyan('"bit install"')} to fix this issue`;
  return `Bit received an error loading ${chalk.cyan(ids.join(', '))}, due to the error:
"${errMsg || '<unknown-error>'}".
This is required for the component: ${chalk.cyan(neededFor || 'unknown')}
Please use the ${chalk.cyan("'--log=error'")} flag for the full error.
${installOutput}
`;
};
