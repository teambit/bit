import { BitError } from '@teambit/bit-error';

export type HashesPerRemotes = { [hash: string]: string[] };

export class MissingObjects extends BitError {
  constructor(hashesPerRemotes: HashesPerRemotes) {
    const hashesPerRemotesStr = Object.keys(hashesPerRemotes)
      .map((hash) => `${hash}: ${hashesPerRemotes[hash].join(', ')}`)
      .join('\n');
    super(`unable to get the following objects:\n${hashesPerRemotesStr}`);
  }
}
