const start = Date.now();
const buf = [];
while (Date.now() - start < 70) buf.push({ pkg: Math.random().toString(36) });

export function pretendInstall(components) {
  return components.map((c) => `installed deps for ${c}`).join('\n');
}
