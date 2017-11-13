/** @flow */
import { packInScope } from '../../api/scope';

function pack({
  id,
  scopePath,
  directory,
  writeBitDependencies,
  links,
  override
}: {
  id: string,
  scopePath: string,
  directory: string,
  writeBitDependencies: boolean,
  links: boolean,
  override: ?boolean
}): Promise<any> {
  return packInScope({ id, scopePath, directory, writeBitDependencies, links, override });
}

module.exports = pack;
