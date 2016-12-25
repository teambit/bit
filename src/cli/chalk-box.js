/** @flow */
import c from 'chalk';

export const formatBit = ({ scope = '@this', box, name }: any): string => 
c.white('     > ') + c.cyan(`${scope}/${box}/${name}`);
