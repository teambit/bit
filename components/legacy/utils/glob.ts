import { glob as globlib } from 'glob';
import path from 'path';

export default async function glob(pattern: string, options?: {}): Promise<string[]> {
  const matches = await globlib(pattern, options);
  return matches.map((match) => path.normalize(match));
}
