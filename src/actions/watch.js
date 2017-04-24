// @flow
import watch from '../watcher';

export default function watchAction(projectRoot: ?string): Promise<any> {
  return watch(projectRoot || process.cwd());
}
