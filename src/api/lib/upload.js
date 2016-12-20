import { loadScope } from '../../scope';

export default function upload({ name, tar }: { name: string, tar: Buffer }): Promise<any> {
  return loadScope().then((scope) => {
    return scope.upload(name, tar);
  });
}
