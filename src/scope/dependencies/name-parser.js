/** @flow */
import { DEPENDENCY_DELIMITER } from '../../constants';

export type DepNameProps = {
  name: string,
  remote: string,
  box: ?string
};

export default function parseDepName(depName: string): DepNameProps {
  const [remote, box, name] = depName.split(DEPENDENCY_DELIMITER);
  if (!name) {
    return {
      remote,
      name: box,
      box: null
    };
  }

  return {
    name,
    remote,
    box
  };
}
