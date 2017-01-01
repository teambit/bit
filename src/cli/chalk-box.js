/** @flow */
import c from 'chalk';

export const formatInlineBit = ({ box, name, version }: any): string => 
c.white('     > ') + c.cyan(`${box}/${name} - ${version}`);

export const formatBit = ({ scope = '@this', box, name, version }: any): string => 
c.white('     > ') + c.cyan(`${scope}/${box}/${name} - ${version}`);
