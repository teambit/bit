// Extract Harmony DI graph: for each *.main.runtime.ts, `static dependencies = [...]`
const fs = require('fs');
const path = require('path');
const { outFile } = require('./scc.js');
const repo = process.argv[2];
const ts = require(path.join(repo, 'node_modules/typescript'));
const { comps } = require(outFile('edges.json'));
const pkgToId = {};
Object.values(comps).forEach((c) => c.pkg && (pkgToId[c.pkg] = c.id));
const di = {}; // id -> {main:[], ui:[], preview:[]}
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(main|ui|preview)\.runtime\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}
for (const c of Object.values(comps)) {
  const root = path.join(repo, c.rootDir);
  if (!fs.existsSync(root)) continue;
  for (const f of walk(root)) {
    const runtime = f.match(/\.(main|ui|preview)\.runtime/)[1];
    const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
    const localToPkg = {};
    sf.statements.forEach((s) => {
      if (ts.isImportDeclaration(s) && s.importClause && ts.isStringLiteral(s.moduleSpecifier)) {
        const spec = s.moduleSpecifier.text;
        const ic = s.importClause;
        if (ic.name) localToPkg[ic.name.text] = spec;
        if (ic.namedBindings && ts.isNamedImports(ic.namedBindings))
          ic.namedBindings.elements.forEach((e) => (localToPkg[e.name.text] = spec));
      }
    });
    const visit = (n) => {
      if (
        ts.isPropertyDeclaration(n) &&
        n.name &&
        n.name.text === 'dependencies' &&
        n.initializer &&
        ts.isArrayLiteralExpression(n.initializer)
      ) {
        const deps = [];
        n.initializer.elements.forEach((el) => {
          if (ts.isIdentifier(el)) {
            const spec = localToPkg[el.text];
            const m = spec && spec.match(/^(@teambit\/[^/]+)/);
            if (m && pkgToId[m[1]]) deps.push(pkgToId[m[1]]);
            else if (spec && spec.startsWith('.')) {
              /* self */
            } else deps.push('?' + el.text + ':' + spec);
          }
        });
        di[c.id] = di[c.id] || {};
        di[c.id][runtime] = (di[c.id][runtime] || []).concat(deps.filter((d) => d !== c.id));
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
}
fs.writeFileSync(outFile('di.json'), JSON.stringify(di, null, 1));
const unresolved = Object.entries(di).flatMap(([k, v]) =>
  Object.values(v)
    .flat()
    .filter((d) => d.startsWith('?'))
    .map((d) => k + ' ' + d)
);
console.log('aspects with DI', Object.keys(di).length, 'unresolved', unresolved.length, unresolved.slice(0, 10));
