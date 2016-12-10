/** @flow */
import { DEPENDENCY_DELIMITER } from '../constants';

export type DepNameProps = {
  name: string,
  remote: string,
  boxName: ?string
};

export default function parseDepName(depName: string): DepNameProps {
  const [remote, boxName, name] = depName.split(DEPENDENCY_DELIMITER);
  if (!name) {
    return {
      remote, 
      name: boxName,
      boxName: null
    };
  }

  return {
    name,
    remote,
    boxName
  };
}
