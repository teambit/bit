import { parse } from 'comment-json';

/**
 * a dependency-resolver detector (registered by dependency-resolver) that reports the env an env.jsonc extends.
 */
export class EnvJsoncDetector {
  isSupported(context: { filename: string }): boolean {
    return context.filename.endsWith('env.jsonc');
  }

  detect(source: string): string[] {
    let parsed: Record<string, any>;
    try {
      parsed = parse(source) as Record<string, any>;
    } catch (err: any) {
      throw new Error(`Failed to parse env.jsonc: ${err.message}`);
    }
    if (!parsed.extends) return [];
    return [parsed.extends];
  }
}
