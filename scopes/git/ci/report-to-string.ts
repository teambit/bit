export function reportToString(result: string | { data: string }): string {
  return typeof result === 'string' ? result : result.data;
}
