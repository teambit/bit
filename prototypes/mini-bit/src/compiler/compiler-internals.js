// Heaviest aspect in the prototype — like babel/swc/ts-loader in real Bit.
const start = Date.now();
const buf = [];
while (Date.now() - start < 90) buf.push({ ast: Math.random().toString(36) });

export function pretendCompile(components) {
  return components.map((c) => `compiled ${c}`).join('\n');
}
