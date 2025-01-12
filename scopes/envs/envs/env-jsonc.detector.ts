import { parse } from 'comment-json';
import { DependencyDetector, FileContext } from '@teambit/dependency-resolver';

export class EnvJsoncDetector implements DependencyDetector {
  isSupported(context: FileContext): boolean {
    return context.filename.endsWith('env.jsonc');
  }

  detect(source: string): string[] {
    const parsed = parse(source) as Record<string, any>;
    if (!parsed.extends) return [];
    return [parsed.extends];
  }
}
