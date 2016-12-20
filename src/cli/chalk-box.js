/** @flow */
import c from 'chalk';

export const formatBit = ({ scope = '@this', box, name }: { scope: string, box: string, name: string }): string => 
c.white('     > ') + c.cyan(`${scope}/${box}/${name}`);
