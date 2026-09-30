// Builds a component-level import graph for the bit workspace and classifies each edge.
// Usage: node analyze.js <repoRoot> <outJson>
const fs = require('fs');
const path = require('path');
const repo = process.argv[2];
const out = process.argv[3];
const ts = require(path.join(repo, 'node_modules/typescript'));

// --- component map
const bitmapRaw = fs.readFileSync(path.join(repo, '.bitmap'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const bitmap = JSON.parse(bitmapRaw);
const comps = {}; // id -> {id, rootDir, pkg}
const pkgToId = {};
for (const [key, val] of Object.entries(bitmap)) {
  if (key.startsWith('$') || !val.rootDir) continue;
  const id = `${val.scope || val.defaultScope}/${val.name}`;
  const pjPath = path.join(repo, val.rootDir, 'package.json');
  let pkg;
  if (fs.existsSync(pjPath)) pkg = JSON.parse(fs.readFileSync(pjPath, 'utf8')).name;
  comps[id] = { id, rootDir: val.rootDir, pkg };
  if (pkg) pkgToId[pkg] = id;
}
// fallback: scan node_modules/@teambit dirs (non-symlinks) for componentId
for (const d of fs.readdirSync(path.join(repo, 'node_modules/@teambit'))) {
  const p = path.join(repo, 'node_modules/@teambit', d);
  if (fs.lstatSync(p).isSymbolicLink()) continue;
  const pj = path.join(p, 'package.json');
  if (!fs.existsSync(pj)) continue;
  const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
  if (!j.componentId) continue;
  const id = `${j.componentId.scope}/${j.componentId.name}`;
  if (comps[id]) {
    comps[id].pkg = j.name;
    pkgToId[j.name] = id;
  }
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?|mdx)$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

function fileKind(rel) {
  if (/\.(spec|test|e2e)\.[tj]sx?$/.test(rel) || /(^|\/)(__tests__|__fixtures__|fixtures|mocks?|testing)\//.test(rel))
    return 'test';
  if (
    /\.composition\.tsx?$/.test(rel) ||
    /\.compositions\.tsx?$/.test(rel) ||
    /\.mdx$/.test(rel) ||
    /\.docs\.tsx?$/.test(rel)
  )
    return 'docs';
  if (
    /\.preview\.runtime\.tsx?$/.test(rel) ||
    /\.ui\.runtime\.tsx?$/.test(rel) ||
    /\.tsx$/.test(rel) ||
    /(^|\/)ui\//.test(rel)
  )
    return 'ui';
  return 'main';
}

function specToPkg(spec) {
  const m = spec.match(/^(@teambit\/[^/]+)(\/.*)?$/);
  return m ? m[1] : null;
}

// Is this identifier reference in a type-only position?
function isTypePosition(id) {
  let node = id;
  let parent = node.parent;
  while (parent) {
    if (ts.isExpressionWithTypeArguments(parent) || ts.isHeritageClause(parent)) {
      const hc = ts.isHeritageClause(parent) ? parent : parent.parent;
      if (hc && ts.isHeritageClause(hc)) {
        if (hc.token === ts.SyntaxKind.ImplementsKeyword) return true;
        if (ts.isInterfaceDeclaration(hc.parent)) return true;
        return false; // class extends -> value
      }
    }
    if (ts.isTypeQueryNode(parent)) return true; // typeof X in type position
    if (ts.isTypeNode(parent) && !ts.isExpressionWithTypeArguments(parent)) return true;
    if (ts.isTypeAliasDeclaration(parent) || ts.isInterfaceDeclaration(parent)) return true;
    // stop climbing at expression/statement boundaries
    if (ts.isStatement(parent) || ts.isSourceFile(parent)) return false;
    if (
      ts.isExpression(parent) &&
      !ts.isQualifiedName(parent) &&
      !ts.isPropertyAccessExpression(parent) &&
      !ts.isIdentifier(parent)
    )
      return false;
    node = parent;
    parent = parent.parent;
  }
  return false;
}

function collectIdentifierUses(sf) {
  const uses = new Map(); // name -> [{typePos}]
  function visit(n) {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      // skip declarations/property names that aren't references
      const isPropName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isQualifiedName(p) && p.right === n) ||
        ((ts.isPropertyAssignment(p) ||
          ts.isPropertyDeclaration(p) ||
          ts.isMethodDeclaration(p) ||
          ts.isPropertySignature(p) ||
          ts.isMethodSignature(p) ||
          ts.isGetAccessor(p) ||
          ts.isSetAccessor(p) ||
          ts.isEnumMember(p)) &&
          p.name === n) ||
        (ts.isBindingElement(p) && p.propertyName === n) ||
        ts.isImportSpecifier(p) ||
        (ts.isExportSpecifier(p) && p.propertyName === n && p.parent.parent.moduleSpecifier) ||
        (ts.isJsxAttribute(p) && p.name === n);
      if (!isPropName) {
        const arr = uses.get(n.text) || [];
        let kind;
        if (ts.isExportSpecifier(p)) kind = p.isTypeOnly || p.parent.parent.isTypeOnly ? 'type' : 'reexport';
        else if (ts.isShorthandPropertyAssignment(p)) kind = 'value';
        else if (ts.isExportAssignment(p)) kind = 'value';
        else kind = isTypePosition(n) ? 'type' : 'value';
        arr.push(kind);
        uses.set(n.text, arr);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return uses;
}

const edges = []; // {from,to,file,line,fileKind,kind,names,valueNames}
for (const c of Object.values(comps)) {
  const root = path.join(repo, c.rootDir);
  if (!fs.existsSync(root)) continue;
  for (const f of walk(root)) {
    const rel = path.relative(root, f);
    const fk = fileKind(rel);
    const text = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.mdx')) {
      const re = /^\s*import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm;
      let m;
      while ((m = re.exec(text))) {
        const pkg = specToPkg(m[1]);
        if (pkg && pkgToId[pkg] && pkgToId[pkg] !== c.id)
          edges.push({
            from: c.id,
            to: pkgToId[pkg],
            file: `${c.rootDir}/${rel}`,
            line: 0,
            fileKind: fk,
            kind: 'value',
            names: [],
          });
      }
      continue;
    }
    const sf = ts.createSourceFile(
      f,
      text,
      ts.ScriptTarget.Latest,
      true,
      f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    let uses;
    const getUses = () => (uses = uses || collectIdentifierUses(sf));
    const add = (spec, node, kind, names, valueNames) => {
      const pkg = specToPkg(spec);
      if (!pkg || !pkgToId[pkg] || pkgToId[pkg] === c.id) return;
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      edges.push({
        from: c.id,
        to: pkgToId[pkg],
        spec,
        file: `${c.rootDir}/${rel}`,
        line,
        fileKind: fk,
        kind,
        names,
        valueNames,
      });
    };
    const visit = (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        const ic = n.importClause;
        if (!ic) return add(spec, n, 'side-effect', [], []);
        if (ic.isTypeOnly) {
          const names = [];
          if (ic.name) names.push(ic.name.text);
          if (ic.namedBindings) {
            if (ts.isNamespaceImport(ic.namedBindings)) names.push('* as ' + ic.namedBindings.name.text);
            else ic.namedBindings.elements.forEach((e) => names.push(e.name.text));
          }
          return add(spec, n, 'type-explicit', names, []);
        }
        const bindings = []; // {local, imported, explicitType}
        if (ic.name) bindings.push({ local: ic.name.text, imported: 'default', explicitType: false });
        if (ic.namedBindings) {
          if (ts.isNamespaceImport(ic.namedBindings))
            bindings.push({ local: ic.namedBindings.name.text, imported: '*', explicitType: false });
          else
            ic.namedBindings.elements.forEach((e) =>
              bindings.push({
                local: e.name.text,
                imported: (e.propertyName || e.name).text,
                explicitType: e.isTypeOnly,
              })
            );
        }
        const u = getUses();
        const valueNames = [];
        let allExplicit = true;
        for (const b of bindings) {
          if (!b.explicitType) allExplicit = false;
          if (b.explicitType) continue;
          const kinds = u.get(b.local) || [];
          if (kinds.some((k) => k === 'value' || k === 'reexport')) valueNames.push(b.imported);
        }
        const names = bindings.map((b) => b.imported);
        if (allExplicit) return add(spec, n, 'type-explicit', names, []);
        if (bindings.length && !valueNames.length) return add(spec, n, 'type-elided', names, []);
        return add(spec, n, 'value', names, valueNames);
      }
      if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (n.isTypeOnly) return add(spec, n, 'type-explicit', [], []);
        const names =
          n.exportClause && ts.isNamedExports(n.exportClause)
            ? n.exportClause.elements.map((e) => (e.propertyName || e.name).text)
            : ['*'];
        const valueNames =
          n.exportClause && ts.isNamedExports(n.exportClause)
            ? n.exportClause.elements.filter((e) => !e.isTypeOnly).map((e) => (e.propertyName || e.name).text)
            : ['*'];
        if (!valueNames.length) return add(spec, n, 'type-explicit', names, []);
        return add(spec, n, 'reexport', names, valueNames);
      }
      if (ts.isCallExpression(n) && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0])) {
        const isReq = ts.isIdentifier(n.expression) && n.expression.text === 'require';
        const isDyn = n.expression.kind === ts.SyntaxKind.ImportKeyword;
        if (isReq || isDyn) add(n.arguments[0].text, n, isDyn ? 'dynamic-import' : 'require', [], []);
      }
      if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
        add(n.argument.literal.text, n, 'type-explicit', [], []);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
}

fs.writeFileSync(out, JSON.stringify({ comps, edges }, null, 1));
console.log('components', Object.keys(comps).length, 'edges', edges.length);
