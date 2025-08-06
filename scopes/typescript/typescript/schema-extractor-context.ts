import type { TsserverClient } from '@teambit/ts-server';
import { getTokenAtPosition, canHaveJsDoc, getJsDoc } from 'tsutils';
import type { ExportAssignment, ExportDeclaration, Node, TypeNode } from 'typescript';
import ts, { getTextOfJSDocComment, SyntaxKind } from 'typescript';
import { head, uniqBy } from 'lodash';
// @ts-expect-error david we should figure fix this.
// eslint-disable-next-line import/no-unresolved
import type protocol from 'typescript/lib/protocol';
import { pathNormalizeToLinux, isRelativeImport } from '@teambit/legacy.utils';
import { resolve, sep, relative, join, isAbsolute, extname } from 'path';
import type { Component, ComponentID } from '@teambit/component';
import type { SchemaNode, Location } from '@teambit/semantics.entities.semantic-schema';
import {
  TypeRefSchema,
  InferenceTypeSchema,
  DocSchema,
  IgnoredSchema,
  TagSchema,
  TypeArraySchema,
  ArrayLiteralExpressionSchema,
  ParameterSchema,
  FunctionLikeSchema,
} from '@teambit/semantics.entities.semantic-schema';
import type { ComponentDependency } from '@teambit/dependency-resolver';
import type { Formatter } from '@teambit/formatter';
import pMapSeries from 'p-map-series';
import type { TypeScriptExtractor } from './typescript.extractor';
import { IdentifierList } from './identifier-list';
import { parseTypeFromQuickInfo } from './transformers/utils/parse-type-from-quick-info';
import { tagParser } from './transformers/utils/jsdoc-to-doc-schema';
import { Identifier } from './identifier';
import { ExportIdentifier } from './export-identifier';

export class SchemaExtractorContext {
  /**
   * list of all declared identifiers (exported and internal) by filename
   */
  private _identifiers = new Map<string, IdentifierList>();
  private _internalIdentifiers = new Map<string, IdentifierList>();

  /**
   * computed nodes by filename and (position (line:character))
   */
  private _computed = new Map<string, SchemaNode>();

  get mainFile() {
    return pathNormalizeToLinux(this.getPathRelativeToComponent(this.component.mainFile.path));
  }

  get identifiers() {
    return this._identifiers;
  }

  get internalIdentifiers() {
    return this._internalIdentifiers;
  }

  get computed() {
    return this._computed;
  }

  get mainFileIdentifierKey() {
    const mainFile = this.component.mainFile;
    return this.getIdentifierKey(mainFile.path);
  }

  get mainModuleIdentifiers() {
    return this.identifiers.get(this.mainFileIdentifierKey);
  }

  constructor(
    readonly tsserver: TsserverClient,
    readonly component: Component,
    readonly extractor: TypeScriptExtractor,
    readonly componentDeps: ComponentDependency[],
    readonly componentRootPath: string,
    readonly hostRootPath: string,
    readonly formatter?: Formatter
  ) {
    this.componentRootPath = pathNormalizeToLinux(componentRootPath);
    this.hostRootPath = pathNormalizeToLinux(hostRootPath);
  }

  getComputedNodeKey({ filePath, line, character }: Location, schema: string) {
    return `${filePath}:${line}:${character}__${schema}`;
  }

  getIdentifierKeyForNode(node: Node) {
    const filePath = node.getSourceFile().fileName;
    return this.getIdentifierKey(filePath);
  }

  getIdentifierKey(filePath: string) {
    return pathNormalizeToLinux(filePath);
  }

  setComputed(node: SchemaNode) {
    const { location, __schema } = node;
    const key = this.getComputedNodeKey(location, __schema);
    this.computed.set(key, node);
  }

  setIdentifiers(filePath: string, identifiers: IdentifierList) {
    this._identifiers.set(this.getIdentifierKey(filePath), identifiers);
  }

  setInternalIdentifiers(filePath: string, identifiers: IdentifierList) {
    const existing = this._internalIdentifiers.get(filePath);
    if (!existing) {
      this._internalIdentifiers.set(filePath, identifiers);
    } else {
      const uniqueIdentifiers = uniqBy(existing.identifiers.concat(identifiers.identifiers), (k) => k.aliasId || k.id);
      this._internalIdentifiers.set(filePath, new IdentifierList(uniqueIdentifiers));
    }
  }

  findComputedSchemaByName(name: string) {
    const computed = Array.from(this.computed.values());
    return computed.filter((schema) => schema.name === name);
  }

  async computeSchema(node: Node): Promise<SchemaNode> {
    const location = this.getLocation(node);
    const key = this.getComputedNodeKey(location, SyntaxKind[node.kind]);
    const existingComputedSchema = this.computed.get(key);
    if (existingComputedSchema) {
      return existingComputedSchema;
    }
    const computedSchema = await this.extractor.computeSchema(node, this);
    this.setComputed(computedSchema);
    return computedSchema;
  }

  async transformSchemaNode(schema: SchemaNode) {
    return this.extractor.transformAPI(schema, this);
  }

  /**
   * returns the location of a node in a source file.
   */
  getLocation(node: Node, targetSourceFile?: ts.SourceFile, absolutePath = false): Location {
    const sourceFile = targetSourceFile || node.getSourceFile();
    const filePath = absolutePath ? sourceFile.fileName : this.getPathRelativeToComponent(sourceFile.fileName);
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const line = position.line + 1;
    const character = position.character + 1;

    return {
      filePath: pathNormalizeToLinux(filePath),
      line,
      character,
    };
  }

  getLocationAsString(node: Node): string {
    const location = this.getLocation(node);
    return `${node.getSourceFile().fileName}, line: ${location.line}, character: ${location.character}`;
  }

  getPathRelativeToComponent(filePath: string): string {
    const basePath = this.component.filesystem.files[0].base;
    return relative(basePath, filePath);
  }

  /**
   * returns a signature for a node.
   */
  async getSignature(node: Node) {
    return this.tsserver.getSignatureHelp(this.getPath(node), this.getLocation(node));
  }

  /**
   * get the position for the tsserver.
   */
  getPosition(sourceFile: ts.SourceFile, line: number, offset: number): number {
    return sourceFile.getPositionOfLineAndCharacter(line - 1, offset - 1);
  }

  /**
   * get the path for a source file.
   */
  getPath(node: Node) {
    const sourceFile = node.getSourceFile();

    const fileName = sourceFile.fileName;

    if (!fileName.startsWith(this.componentRootPath) && !fileName.startsWith(this.hostRootPath)) {
      return join(this.componentRootPath, fileName);
    }

    return sourceFile.fileName;
  }

  async getQuickInfo(node: Node) {
    const location = this.getLocation(node);
    try {
      return await this.tsserver.getQuickInfo(this.getPath(node), location);
    } catch (err: any) {
      if (err.message === 'No content available.') {
        throw new Error(
          `unable to get quickinfo data from tsserver at ${this.getPath(node)}, Ln ${location.line}, Col ${
            location.character
          }`
        );
      }
      throw err;
    }
  }

  async getQuickInfoDisplayString(node: Node): Promise<string> {
    const quickInfo = await this.getQuickInfo(node);
    return quickInfo?.body?.displayString || '';
  }

  /**
   * returns the type definition for a type.
   */
  typeDefinition(node: Node) {
    return this.tsserver.getTypeDefinition(this.getPath(node), this.getLocation(node));
  }

  visitTypeDefinition() {}

  private getPathWithoutExtension(filePath: string) {
    const knownExtensions = ['ts', 'js', 'jsx', 'tsx'];
    const fileExtension = extname(filePath).substring(1);

    const filePathWithoutExtension = () => {
      if (knownExtensions.includes(fileExtension)) {
        return filePath.replace(new RegExp(`\\.${fileExtension}$`), '');
      }
      return filePath;
    };

    if (!isAbsolute(filePath)) {
      return filePathWithoutExtension();
    }

    if (filePath.startsWith(this.componentRootPath)) {
      return relative(this.componentRootPath, filePathWithoutExtension());
    }
    if (filePath.startsWith(this.hostRootPath)) {
      return relative(this.hostRootPath, filePathWithoutExtension());
    }
    return filePathWithoutExtension();
  }

  private isIndexFile(filePath: string, currentFilePath: string) {
    const indexFilePath = join(filePath, 'index');
    return pathNormalizeToLinux(indexFilePath) === currentFilePath;
  }

  findFileInComponent(filePath: string) {
    const normalizedFilePath = pathNormalizeToLinux(filePath);
    const pathToCompareWithoutExtension = this.getPathWithoutExtension(normalizedFilePath);

    const matchingFile = this.component.filesystem.files.find((file) => {
      const currentFilePath = pathNormalizeToLinux(file.path);
      const currentFilePathWithoutExtension = this.getPathWithoutExtension(currentFilePath);

      const isSameFilePath = pathToCompareWithoutExtension === currentFilePathWithoutExtension;

      const matches =
        isSameFilePath || this.isIndexFile(pathToCompareWithoutExtension, currentFilePathWithoutExtension);

      return matches;
    });
    return matchingFile;
  }

  private parsePackageNameFromPath(path: string) {
    const parts = path.split('node_modules');

    if (parts.length === 1) {
      return path;
    }

    const lastPart = parts[parts.length - 1].replace(sep, '');
    const pkgParts = lastPart.split('/');
    if (lastPart.startsWith('@')) {
      // scoped package
      return `${pkgParts[0]}/${pkgParts[1]}`;
    }
    const pkgName = pkgParts[0];
    if (pkgName === 'typescript') {
      // it's a built-in type, such as "string".
      return '';
    }
    return pkgName;
  }

  /**
   * return the file if part of the component.
   * otherwise, a reference to the target package and the type name.
   */
  getSourceFileInsideComponent(filePath: string) {
    const file = this.findFileInComponent(filePath);
    return file && this.extractor.parseSourceFile(file);
  }

  async getSourceFileFromNode(node: Node) {
    const filePath = await this.getFilePathByNode(node);
    if (!filePath) {
      return undefined;
    }
    return this.getSourceFileInsideComponent(filePath);
  }

  async getFilePathByNode(node: Node) {
    const def = await this.tsserver.getDefinition(this.getPath(node), this.getLocation(node));

    const firstDef = head(def?.body);
    return firstDef?.file;
  }

  async definitionInfo(node: Node): Promise<protocol.DefinitionInfo | undefined> {
    const location = this.getLocation(node);
    const filePath = this.getPath(node);

    const def = await this.tsserver.getDefinition(filePath, location);

    const firstDef = head(def?.body);

    return firstDef;
  }

  /**
   * get a definition for a given node.
   */
  async definition(definition: protocol.DefinitionInfo): Promise<Node | undefined> {
    const startPosition = definition.start;
    const sourceFile = this.getSourceFileInsideComponent(definition.file);
    if (!sourceFile) {
      // it might be an external reference, cant get the node
      return undefined;
    }
    const pos = this.getPosition(sourceFile, startPosition.line, startPosition.offset);
    const nodeAtPos = getTokenAtPosition(sourceFile, pos);
    return nodeAtPos;
  }

  /**
   * visit a definition for node - e.g. return it's schema.
   */
  async visitDefinition(node: Node): Promise<SchemaNode | undefined> {
    const definitionInfo = await this.definitionInfo(node);
    if (!definitionInfo) {
      return undefined;
    }

    const definition = await this.definition(definitionInfo);
    if (!definition) {
      return this.getTypeRefForExternalNode(node);
    }

    return this.visit(definition.parent);
  }

  async visit(node: Node): Promise<SchemaNode> {
    if (node.kind === SyntaxKind.Identifier && node.parent.parent.kind !== SyntaxKind.SourceFile) {
      return this.visit(node.parent);
    }
    return this.extractor.computeSchema(node, this);
  }

  references() {}

  isExported() {}

  isFromComponent() {}

  async getFileIdentifiers(exportDec: ExportDeclaration | ExportAssignment) {
    const file = exportDec.getSourceFile().fileName;
    const specifierPathStr =
      (exportDec.kind === SyntaxKind.ExportDeclaration && exportDec.moduleSpecifier?.getText()) || '';
    const specifierPath = specifierPathStr.substring(1, specifierPathStr.length - 1);
    const absPath = resolve(file, '..', specifierPath);
    const sourceFile = this.getSourceFileInsideComponent(absPath);
    if (!sourceFile) return [];
    return this.getIdentifiers(sourceFile);
  }

  async getFileExports(exportDec: ExportDeclaration | ExportAssignment) {
    const identifiers = await this.getFileIdentifiers(exportDec);
    return identifiers.filter((identifier) => ExportIdentifier.isExportIdentifier(identifier));
  }

  async getFileInternals(exportDec: ExportDeclaration | ExportAssignment) {
    const identifiers = await this.getFileIdentifiers(exportDec);
    return identifiers.filter((identifier) => !ExportIdentifier.isExportIdentifier(identifier));
  }

  getIdentifiers(node: Node) {
    return this.extractor.computeIdentifiers(node, this);
  }

  /**
   * tsserver has two different calls: "definition" and "typeDefinition".
   * normally, we need the "typeDefinition" to get the type data of a node.
   * sometimes, it has no data, for example when the node is of type TypeReference, and then using "definition" is
   * helpful. (couldn't find a rule when to use each one. e.g. "VariableDeclaration" sometimes has data only in
   * "definition" but it's not clear when/why).
   */
  async getDefinition(node: Node) {
    const typeDefinition = await this.typeDefinition(node);
    const headTypeDefinition = head(typeDefinition?.body);
    if (headTypeDefinition) {
      return headTypeDefinition;
    }

    const definition = await this.tsserver.getDefinition(node.getSourceFile().fileName, this.getLocation(node));
    const headDefinition = head(definition?.body);

    return headDefinition;
  }

  /**
   * Handles type resolution for unknown or external types.
   * Attempts to:
   * 1. Get type references when possible
   * 2. Fall back to inference when references can't be found
   */
  private async unknownExactType(node: Node, location: Location, typeStr = 'any') {
    try {
      if (this.isArrayType(typeStr)) {
        const baseType = this.getArrayBaseType(typeStr);
        const currentFilePath = node.getSourceFile().fileName;
        const baseTypeRef = await this.getTypeRef(baseType, this.getIdentifierKey(currentFilePath), location);

        if (baseTypeRef) {
          return new TypeArraySchema(location, baseTypeRef);
        }

        return new TypeArraySchema(location, new InferenceTypeSchema(location, baseType));
      }

      const currentFilePath = node.getSourceFile().fileName;
      const typeRef = await this.getTypeRef(typeStr, this.getIdentifierKey(currentFilePath), location);
      if (typeRef) {
        return typeRef;
      }

      const info = await this.getQuickInfo(node);
      if (!info?.body?.displayString) {
        return new InferenceTypeSchema(location, typeStr || 'any');
      }

      const { displayString, kind } = info.body;

      if (kind === 'method') {
        const returnType = this.extractMethodReturnType(displayString);
        return await this.createMethodReturnSchema(node, location, returnType);
      }

      if (kind === 'function' || displayString.includes('=>')) {
        return await this.createFunctionSchema(node, location, displayString);
      }

      if (displayString.includes('{') && displayString.includes('}')) {
        return this.createObjectSchema(node, location, displayString);
      }

      if (displayString.includes('Promise<')) {
        const innerType = this.extractGenericType(displayString, 'Promise');
        return await this.createPromiseSchema(node, location, innerType);
      }

      return new InferenceTypeSchema(location, typeStr || 'any');
    } catch {
      return new InferenceTypeSchema(location, typeStr || 'any');
    }
  }

  /**
   * Check if type is an array type (either T[] or Array<T>)
   */
  private isArrayType(typeStr: string): boolean {
    return typeStr.endsWith('[]') || typeStr.startsWith('Array<');
  }

  /**
   * Extract base type from array type
   */
  private getArrayBaseType(typeStr: string): string {
    if (typeStr.endsWith('[]')) {
      return typeStr.slice(0, -2);
    }
    if (typeStr.startsWith('Array<')) {
      const match = /Array<(.+)>/.exec(typeStr);
      return match?.[1] || 'any';
    }
    return typeStr;
  }

  /**
   * Extract return type from method signature
   */
  private extractMethodReturnType(displayString: string): string {
    const returnTypeMatch = displayString.match(/\):\s*(.+)$/);
    return returnTypeMatch ? returnTypeMatch[1].trim() : 'any';
  }

  /**
   * Extract content from generic type
   */
  private extractGenericType(type: string, wrapper: string): string {
    const match = new RegExp(`${wrapper}<(.+)>`).exec(type);
    return match ? match[1].trim() : type;
  }

  /**
   * Create schema for method return type, attempting to get type reference
   */
  private async createMethodReturnSchema(node: Node, location: Location, returnType: string): Promise<SchemaNode> {
    if (this.isArrayType(returnType)) {
      const baseType = this.getArrayBaseType(returnType);
      const currentFilePath = node.getSourceFile().fileName;
      const baseTypeRef = await this.getTypeRef(baseType, this.getIdentifierKey(currentFilePath), location);

      if (baseTypeRef) {
        return new TypeArraySchema(location, baseTypeRef);
      }
      return new TypeArraySchema(location, new InferenceTypeSchema(location, baseType));
    }

    const typeRef = await this.getTypeRef(returnType, this.getIdentifierKeyForNode(node), location);
    return typeRef || new InferenceTypeSchema(location, returnType);
  }

  /**
   * Create schema for function type, handling params and return type
   */
  private async createFunctionSchema(node: Node, location: Location, signature: string): Promise<FunctionLikeSchema> {
    const match = signature.match(/\((.*)\)\s*(?:=>|:)\s*(.+)/);
    if (!match) {
      return new FunctionLikeSchema(location, 'anonymous', [], new InferenceTypeSchema(location, 'any'), signature);
    }

    const [, paramsStr, returnTypeStr] = match;
    const params = await this.createFunctionParameters(node, location, paramsStr);
    const returnType = await this.createMethodReturnSchema(node, location, returnTypeStr.trim());

    return new FunctionLikeSchema(location, 'anonymous', params, returnType, signature);
  }

  /**
   * Create parameters for function schema, attempting to get type references for param types
   */
  private async createFunctionParameters(
    node: Node,
    location: Location,
    paramsStr: string
  ): Promise<ParameterSchema[]> {
    if (!paramsStr.trim()) return [];

    const params = paramsStr.split(',');
    const paramSchemas: ParameterSchema[] = [];

    for (const param of params) {
      const [nameWithOptional, type] = param.split(':').map((s) => s.trim());
      const isOptional = nameWithOptional.includes('?');
      const name = nameWithOptional.replace('?', '');

      if (!type) {
        paramSchemas.push(new ParameterSchema(location, name, new InferenceTypeSchema(location, 'any'), isOptional));
        continue;
      }

      const currentFilePath = node.getSourceFile().fileName;
      const typeRef = await this.getTypeRef(type, this.getIdentifierKey(currentFilePath), location);
      paramSchemas.push(
        new ParameterSchema(location, name, typeRef || new InferenceTypeSchema(location, type), isOptional)
      );
    }

    return paramSchemas;
  }

  /**
   * Create schema for object literal type
   */
  private createObjectSchema(node: Node, location: Location, displayString: string): SchemaNode {
    const objMatch = displayString.match(/{([^}]+)}/);
    if (!objMatch) {
      return new InferenceTypeSchema(location, 'object');
    }

    const objContent = objMatch[1];
    const properties = objContent
      .split(';')
      .map((prop) => prop.trim())
      .filter(Boolean)
      .map((prop) => new InferenceTypeSchema(location, prop));

    return new ArrayLiteralExpressionSchema(properties, location);
  }

  /**
   * Create schema for Promise type, attempting to get type reference for the contained type
   */
  private async createPromiseSchema(node: Node, location: Location, innerType: string): Promise<SchemaNode> {
    const typeRef = await this.getTypeRef(innerType, this.getIdentifierKeyForNode(node), location);
    return typeRef || new InferenceTypeSchema(location, innerType);
  }

  // the reason for this check is to avoid infinite loop when calling `this.jump` with the same file+location
  private isDefInSameLocation(node: Node, definition: protocol.FileSpanWithContext) {
    if (definition.file !== node.getSourceFile().fileName) {
      return false;
    }
    const loc = this.getLocation(node);

    return loc.line === definition.start.line && loc.character === definition.start.offset;
  }

  /**
   * resolve a type by a node and its identifier.
   */
  async resolveType(node: Node & { type?: TypeNode }, typeStr: string): Promise<SchemaNode> {
    const location = this.getLocation(node);

    // check if internal ref with typeInfo
    const internalRef = await this.getTypeRef(typeStr, this.getIdentifierKeyForNode(node), location);

    if (internalRef) return internalRef;

    // if a node has "type" prop, it has the type data of the node. this normally happens when the code has the type
    // explicitly, e.g. `const str: string` vs implicitly `const str = 'some-string'`, which the node won't have "type"
    if (node.type && ts.isTypeNode(node.type)) {
      return this.computeSchema(node.type);
    }

    const definition = await this.getDefinition(node);

    if (!definition) {
      return this.unknownExactType(node, location, typeStr);
    }

    if (this.isDefInSameLocation(node, definition)) {
      return this.unknownExactType(node, location, typeStr);
    }

    const definitionNode = await this.definition(definition);

    if (!definitionNode) {
      return this.unknownExactType(node, location, typeStr);
    }

    const definitionNodeName = definitionNode?.getText();

    // check if internal ref with definition info
    const definitionInternalRef = await this.getTypeRef(
      definitionNodeName,
      this.getIdentifierKeyForNode(definitionNode),
      location
    );

    if (definitionInternalRef) return definitionInternalRef;

    const transformer = this.extractor.getTransformer(definitionNode, this);

    if (transformer === undefined) {
      const file = this.findFileInComponent(definition.file);
      if (!file) return this.getTypeRefForExternalPath(typeStr, definition.file, location);
      return this.unknownExactType(node, location, typeStr);
    }

    const schemaNode = await this.visit(definitionNode);

    if (!schemaNode) {
      return this.unknownExactType(node, location, typeStr);
    }

    const apiTransformer = this.extractor.getAPITransformer(schemaNode);
    let transformedApi = apiTransformer ? await apiTransformer.transform(schemaNode, this) : schemaNode;
    if (!transformedApi) {
      transformedApi = new IgnoredSchema(schemaNode);
    }
    return transformedApi;
  }

  private getCompIdByPkgName(pkgName: string): ComponentID | undefined {
    return this.componentDeps.find((dep) => dep.packageName === pkgName)?.componentId;
  }

  async getTypeRef(typeStr: string, filePath: string, location: Location): Promise<TypeRefSchema | undefined> {
    const nodeIdentifierKey = this.getIdentifierKey(filePath);
    const mainFileIdentifierKey = this.mainFileIdentifierKey;
    const nodeIdentifierList = this.identifiers.get(nodeIdentifierKey);
    const mainIdentifierList = this.identifiers.get(mainFileIdentifierKey);

    const nodeIdentifier = new Identifier(typeStr, nodeIdentifierKey);
    const mainIdentifier = new Identifier(typeStr, mainFileIdentifierKey);

    const parsedNodeIdentifier = nodeIdentifierList?.find(nodeIdentifier);
    const parsedMainIdentifier = mainIdentifierList?.find(mainIdentifier);
    const isExportedFromMain = parsedMainIdentifier && ExportIdentifier.isExportIdentifier(parsedMainIdentifier);

    if (!parsedNodeIdentifier) return undefined;

    const internalRef = !isExportedFromMain;
    if (internalRef) {
      this.setInternalIdentifiers(parsedNodeIdentifier.normalizedPath, new IdentifierList([parsedNodeIdentifier]));
    }
    return this.resolveTypeRef(parsedNodeIdentifier, location, isExportedFromMain);
  }

  async resolveTypeRef(
    identifier: Identifier,
    location: Location,
    isExportedFromMain?: boolean
  ): Promise<TypeRefSchema> {
    const sourceFilePath = identifier.sourceFilePath;

    if (!sourceFilePath || (isExportedFromMain && isRelativeImport(sourceFilePath))) {
      return new TypeRefSchema(
        location,
        identifier.id,
        undefined,
        undefined,
        !isExportedFromMain ? this.getPathRelativeToComponent(identifier.filePath) : undefined
      );
    }

    if (!isRelativeImport(sourceFilePath)) {
      const pkgName = this.parsePackageNameFromPath(sourceFilePath);
      const compIdByPkg = this.getCompIdByPkgName(pkgName);

      const compIdByPath = await this.extractor.getComponentIDByPath(sourceFilePath);

      if (compIdByPath) {
        return new TypeRefSchema(location, identifier.id, compIdByPath);
      }

      if (compIdByPkg) {
        return new TypeRefSchema(location, identifier.id, compIdByPkg);
      }

      // package without comp id
      return new TypeRefSchema(location, identifier.id, undefined, pkgName);
    }

    const relativeDir = identifier.filePath.substring(0, identifier.filePath.lastIndexOf('/'));
    const absFilePath = resolve(this.componentRootPath, relativeDir, sourceFilePath);

    const compFilePath = this.findFileInComponent(absFilePath);
    if (!compFilePath) {
      // @todo handle this better
      throw new Error(
        `cannot find file in component \n source file path ${sourceFilePath}\n
        identifier file path ${identifier.filePath}\nrelative dir ${relativeDir}\n
        absFilePath ${absFilePath}`
      );
      return new TypeRefSchema(location, identifier.id);
    }

    const idKey = this.getIdentifierKey(compFilePath?.path);

    // if re exported from a file, recurse until definition
    const exportedIdentifier = (this.identifiers.get(idKey)?.identifiers || []).find((i) => i.id === identifier.id);

    if (exportedIdentifier) {
      return this.resolveTypeRef(exportedIdentifier, location, isExportedFromMain);
    }

    return new TypeRefSchema(location, identifier.id);
  }

  async getTypeRefForExternalNode(node: Node): Promise<TypeRefSchema> {
    const info = await this.getQuickInfo(node);
    const typeStr = parseTypeFromQuickInfo(info);
    const location = this.getLocation(node);
    const filePath = this.getPath(node);
    return this.getTypeRefForExternalPath(typeStr, filePath, location);
  }

  async getTypeRefForExternalPath(typeStr: string, filePath: string, location: Location): Promise<TypeRefSchema> {
    const compIdByPath = await this.extractor.getComponentIDByPath(filePath);
    if (compIdByPath) {
      return new TypeRefSchema(location, typeStr, compIdByPath);
    }
    const pkgName = this.parsePackageNameFromPath(filePath);
    const compIdByPkg = this.getCompIdByPkgName(pkgName);
    if (compIdByPkg) {
      return new TypeRefSchema(location, typeStr, compIdByPkg);
    }
    return new TypeRefSchema(location, typeStr, undefined, pkgName);
  }

  async jsDocToDocSchema(node: Node): Promise<DocSchema | undefined> {
    if (!canHaveJsDoc(node)) {
      return undefined;
    }
    const jsDocs = getJsDoc(node);

    if (!jsDocs.length) {
      return undefined;
    }
    // not sure how common it is to have multiple JSDocs. never seen it before.
    // regardless, in typescript implementation of methods like `getJSDocDeprecatedTag()`, they use the first one. (`getFirstJSDocTag()`)
    const jsDoc = jsDocs[0];

    const location = this.getLocation(jsDoc);
    // Extract link comments and filter them out from the main comment
    const linkComments = (
      typeof jsDoc.comment !== 'string' ? (jsDoc.comment?.filter((c) => c.kind === ts.SyntaxKind.JSDocLink) ?? []) : []
    ) as ts.JSDocLink[];
    const linkTags = linkComments.map((linkComment) => {
      const tagName = 'link';
      const tagText = `${linkComment.name?.getText() ?? ''}${linkComment.text ?? ''}`;
      const tagLocation = this.getLocation(linkComment);
      return new TagSchema(tagLocation, tagName, tagText);
    });

    const commentsWithoutLink = (typeof jsDoc.comment !== 'string'
      ? (jsDoc.comment?.filter((c) => c.kind !== ts.SyntaxKind.JSDocLink) ?? '')
      : jsDoc.comment) as unknown as ts.NodeArray<ts.JSDocComment>;

    const comment = getTextOfJSDocComment(commentsWithoutLink);

    const tags = (jsDoc.tags ? await pMapSeries(jsDoc.tags, (tag) => tagParser(tag, this, this.formatter)) : []).concat(
      linkTags
    );

    return new DocSchema(location, jsDoc.getText(), comment, tags);
  }
}
