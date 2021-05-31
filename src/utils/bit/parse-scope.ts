export function parseScope(scopeId?: string | null): { scope?: string; owner?: string } {
  if (!scopeId) return {};
  if (scopeId.includes('.')) {
    const [owner, scope] = scopeId.split('.');
    return { scope, owner };
  }
  return { scope: scopeId };
}
