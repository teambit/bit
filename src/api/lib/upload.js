import { loadScope } from '../../scope';

export default function upload({ name, tar }: { name: string, tar: Buffer }): Promise<any> {
  const scope = loadScope();
  return scope.upload(name, tar);
}
