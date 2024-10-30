import { parse } from 'comment-json';
import { DependencyDetector, FileContext } from '@teambit/dependency-resolver';

export class EnvJsoncDetector implements DependencyDetector {
  isSupported(context: FileContext): boolean {
    return context.ext === '.jsonc';
  }

  detect(source: string): string[] {
    // TODO: get the file name from the context in the isSupported method then filter it there
    // check if the source is an env.jsonc file
    if (!source.includes('"extends"')) return [];
    const parsed = parse(source);
    if (!parsed.extends) return [];
    return [parsed.extends];
  }
}
