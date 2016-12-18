/** @flow */
import { loadScope } from '../../scope';
import BitJson from '../../bit-json';

export default function prepare({ name, json }: { name: string, json: string }) {
  const scope = loadScope();
  return Promise.resolve(
    { path: scope.prepareBitRegistration(name, BitJson.loadFromRaw(JSON.parse(json))) }
  );
}
