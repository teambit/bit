/** Published AST extension algorithms consume private source spools, never workspace mutation plans. */
async function renameAst({ files, sourceName, targetName }) {
  const typescript = bitRequire('@teambit/typescript');
  const imported = bitRequire('camelcase');
  const camelCase = imported.default || imported;
  const oldPascal = camelCase(sourceName, { pascalCase: true });
  const newPascal = camelCase(targetName, { pascalCase: true });
  const stages = [
    { updates: { [sourceName]: targetName, [oldPascal]: newPascal }, transforms: ['importTransformer', 'exportTransformer'] },
    { updates: { [camelCase(sourceName)]: camelCase(targetName) }, transforms: ['variableNamesTransformer', 'functionNamesTransformer'] },
    { updates: { [oldPascal]: newPascal, [camelCase(`${sourceName}Props`, { pascalCase: true })]: camelCase(`${targetName}Props`, { pascalCase: true }) },
      transforms: ['typeReferenceTransformer', 'typeAliasNamesTransformer', 'functionNamesTransformer', 'interfaceNamesTransformer', 'variableNamesTransformer', 'classNamesTransformer', 'expressionStatementTransformer'] },
  ];
  for (const stage of stages) for (const file of files) {
    let content = fs.readFileSync(file.spool, 'utf8');
    content = await typescript.transformSourceFile(file.filename, content,
      stage.transforms.map(name => typescript[name](stage.updates)), undefined, stage.updates);
    fs.writeFileSync(file.spool, content);
  }
  return {};
}
