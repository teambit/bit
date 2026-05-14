const start = Date.now();
const buf = [];
while (Date.now() - start < 40) buf.push({ a: Math.random(), b: Math.random() });

export function computeStatus(workspace) {
  const map = workspace.components();
  const modified = [];
  const newComps = [];
  for (const [name, info] of Object.entries(map)) {
    if (info.modified) modified.push(name);
    if (info.new) newComps.push(name);
  }
  return { modified, newComps };
}
