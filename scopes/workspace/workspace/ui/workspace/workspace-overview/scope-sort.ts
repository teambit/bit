export function sortScopes(scopes: string[]) {
  const designPrefix = 'design';

  const nonDesign = scopes.filter((s) => !s.includes(designPrefix)).sort((a, b) => a.localeCompare(b));

  const design = scopes.filter((s) => s.includes(designPrefix)).sort((a, b) => a.localeCompare(b));

  return [...nonDesign, ...design];
}
