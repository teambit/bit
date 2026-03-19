import { parse } from 'comment-json';
import type { DependencyDetector, FileContext } from '@teambit/dependency-resolver';

export class EnvJsoncDetector implements DependencyDetector {
  isSupported(context: FileContext): boolean {
    return context.filename.endsWith('env.jsonc') || context.filename.endsWith('tsconfig.json');
  }

  detect(source: string): string[] {
    try {
      const parsed = parse(source) as Record<string, any>;
      if (!parsed.extends) return [];
      const extendsArr: string[] = Array.isArray(parsed.extends) ? parsed.extends : [parsed.extends];
      // only return non-relative extends (i.e. package references)
      return extendsArr.filter((ext) => !ext.startsWith('.'));
    } catch {
      return [];
    }
  }
}
