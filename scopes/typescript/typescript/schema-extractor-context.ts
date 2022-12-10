import { TsserverClient } from '@teambit/ts-server';
import { getTokenAtPosition, canHaveJsDoc, getJsDoc } from 'tsutils';
import ts, { ExportAssignment, getTextOfJSDocComment, ExportDeclaration, Node, SyntaxKind, TypeNode } from 'typescript';
import { head } from 'lodash';
// @ts-ignore david we should figure fix this.
// eslint-disable-next-line import/no-unresolved
import protocol from 'typescript/lib/protocol';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import { resolve, sep, relative } from 'path';
import { Component, ComponentID } from '@teambit/component';
import {
  TypeRefSchema,
  SchemaNode,
  InferenceTypeSchema,
  Location,
  DocSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { ComponentDependency } from '@teambit/dependency-resolver';
import { Formatter } from '@teambit/formatter';
import pMapSeries from 'p-map-series';
import { TypeScriptExtractor } from './typescript.extractor';
import { IdentifierList } from './identifier-list';
import { TransformerNotFound } from './exceptions';
import { parseTypeFromQuickInfo } from './transformers/utils/parse-type-from-quick-info';
import { tagParser } from './transformers/utils/jsdoc-to-doc-schema';
import { Identifier } from './identifier';
import { ExportIdentifier } from './export-identifier';

export class SchemaExtractorContext {
  /**
   * list of all declared identifiers (exported and internal) by filename
   */
  private _identifiers = new Map<string, IdentifierList>();
  /**
   * computed nodes by filename and position (line:character)
   */
  private _nodes = new Map<string, SchemaNode>();

  get mainFile() {
    return pathNormalizeToLinux(this.getPathRelativeToComponent(this.component.mainFile.path));
  }

  get identifiers() {
    return this._identifiers;
  }

  get nodes() {
    return this._nodes;
  }

  constructor(
    readonly tsserver: TsserverClient,
    readonly component: Component,
    readonly extractor: TypeScriptExtractor,
    readonly componentDeps: ComponentDependency[],
    readonly formatter: Formatter
  ) {}

  getComputedNodeKey({ filePath, line, character }: Location) {
    return `${filePath}:${line}:${character}`;
  }

  getIdentifierKeyForNode(node: Node) {
    const filePath = node.getSourceFile().fileName;
    return this.getIdentifierKey(filePath);
  }

  getIdentifierKey(filePath: string) {
    return pathNormalizeToLinux(filePath);
  }

  getMainFileIdentifierKey() {
    const mainFile = this.component.mainFile;
    return this.getIdentifierKey(mainFile.path);
  }

  setComputed(node: SchemaNode) {
    const { location } = node;
    const key = this.getComputedNodeKey(location);
    this.nodes.set(key, node);
  }

  setIdentifiers(filePath: string, identifiers: IdentifierList) {
    this._identifiers.set(this.getIdentifierKey(filePath), identifiers);
  }

  async computeSchema(node: Node) {
    const location = this.getLocation(node);
    const key = this.getComputedNodeKey(location);
    // console.trace(
    //   '🚀 ~ file: schema-extractor-context.ts:85 ~ SchemaExtractorContext ~ computeSchema ~ key',
    //   key,
    //   node.kind
    // );
    const existingComputedSchema = this.nodes.get(key);
    if (existingComputedSchema) {
      // console.log(
      //   '🚀 ~ file: schema-extractor-context.ts:88 ~ SchemaExtractorContext ~ computeSchema ~ existingComputedSchema'
      // );
      return existingComputedSchema;
    }
    const computedSchema = await this.extractor.computeSchema(node, this);
    // console.log('🚀 ~ file: schema-extractor-context.ts:92 ~ SchemaExtractorContext ~ computeSchema ~ Computing ');
    this.setComputed(computedSchema);
    return computedSchema;
  }

  /**
   * returns the location of a node in a source file.
   */
  getLocation(node: Node, targetSourceFile?: ts.SourceFile, absolutePath = false): Location {
    const sourceFile = targetSourceFile || node.getSourceFile();
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const line = position.line + 1;
    const character = position.character + 1;
    const filePath = absolutePath ? sourceFile.fileName : this.getPathRelativeToComponent(sourceFile.fileName);

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

  findFileInComponent(filePath: string) {
    const matchingFile = this.component.filesystem.files.find((file) => {
      // TODO: fix this line to support further extensions.
      if (file.path.includes(filePath)) {
        const strings = ['ts', 'tsx', 'js', 'jsx'].map((format) => {
          if (filePath.endsWith(format)) return filePath;
          // check if it is an index file export
          return `${filePath}.${format}`;
        });

        const matchesWithExtension = !!strings.find((string) => string === file.path);

        const matchesIndexFile = `${filePath}/index.ts` === file.path;

        return matchesWithExtension || matchesIndexFile;
      }

      return false;
    });

    return matchingFile;
  }

  private parsePackageNameFromPath(path: string) {
    const parts = path.split('node_modules');
    if (parts.length === 1) return '';
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

    const firstDef = head(def.body);
    return firstDef?.file;
  }

  async definitionInfo(node: Node): Promise<protocol.DefinitionInfo | undefined> {
    const location = this.getLocation(node);
    const filePath = this.getPath(node);

    const def = await this.tsserver.getDefinition(filePath, location);

    const firstDef = head(def.body);

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
    if (node.kind === SyntaxKind.Identifier && node.parent.parent !== undefined) {
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
    return head(definition?.body);
  }

  // when we can't figure out the component/package/type of this node, we'll use the typeStr as the type.
  private async unknownExactType(node: Node, location: Location, typeStr = 'any', isTypeStrFromQuickInfo = true) {
    if (isTypeStrFromQuickInfo) {
      return new InferenceTypeSchema(location, typeStr || 'any');
    }
    const info = await this.getQuickInfo(node);
    const type = parseTypeFromQuickInfo(info);
    return new InferenceTypeSchema(location, type, typeStr);
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
  async resolveType(
    node: Node & { type?: TypeNode },
    typeStr: string,
    isTypeStrFromQuickInfo = true
  ): Promise<SchemaNode> {
    const location = this.getLocation(node);

    // check if internal ref with typeInfo
    const internalRef = await this.getTypeRefForInternalNode(typeStr, this.getIdentifierKeyForNode(node), location);

    if (internalRef) return internalRef;

    // if a node has "type" prop, it has the type data of the node. this normally happens when the code has the type
    // explicitly, e.g. `const str: string` vs implicitly `const str = 'some-string'`, which the node won't have "type"
    if (node.type && ts.isTypeNode(node.type)) {
      // console.log('\n🚀 ~ node has type 386 \n\n\n', node.type);
      return this.computeSchema(node.type);
    }

    const definition = await this.getDefinition(node);

    if (!definition) {
      // console.log('\n🚀 ~ node has no definition 393 \n\n\n', typeStr);
      return this.unknownExactType(node, location, typeStr, isTypeStrFromQuickInfo);
    }

    const file = this.findFileInComponent(definition.file);

    if (!file) return this.getTypeRefForExternalPath(typeStr, definition.file, location);

    if (this.isDefInSameLocation(node, definition)) {
      return this.unknownExactType(node, location, typeStr, isTypeStrFromQuickInfo);
    }
    const definitionNode = await this.definition(definition);
    if (!definitionNode) {
      return this.unknownExactType(node, location, typeStr, isTypeStrFromQuickInfo);
    }
    const definitionNodeName = definitionNode?.getText();
    // check if internal ref with definition info
    const definitionInternalRef = await this.getTypeRefForInternalNode(
      definitionNodeName,
      this.getIdentifierKeyForNode(definitionNode),
      location
    );

    if (definitionInternalRef) return definitionInternalRef;

    try {
      const schemaNode = await this.visit(definitionNode);
      // if (schemaNode) console.log('\n\n\n 426 compute schema node \n', schemaNode.name);
      return schemaNode || this.unknownExactType(node, location, typeStr, isTypeStrFromQuickInfo);
    } catch (err) {
      if (err instanceof TransformerNotFound) {
        return this.unknownExactType(node, location, typeStr, isTypeStrFromQuickInfo);
      }
      throw err;
    }

    // console.log('\n\n🚀EXTERNAL REF SchemaExtractorContext ~ typeStr\n\n', typeStr);
  }

  private getCompIdByPkgName(pkgName: string): ComponentID | undefined {
    return this.componentDeps.find((dep) => dep.packageName === pkgName)?.componentId;
  }

  async getTypeRefForInternalNode(
    typeStr: string,
    filePath: string,
    location: Location
  ): Promise<TypeRefSchema | undefined> {
    const nodeIdentifierKey = this.getIdentifierKey(filePath);
    const mainFileIdentifierKey = this.getMainFileIdentifierKey();

    // console.log(
    //   '🚀 ~ file: schema-extractor-context.ts:378 ~ SchemaExtractorContext ~ nodeIdentifierKey',
    //   nodeIdentifierKey
    // );

    // console.log(
    //   '🚀 ~ file: schema-extractor-context.ts:379 ~ SchemaExtractorContext ~ mainFileIdentifierKey',
    //   mainFileIdentifierKey
    // );

    const nodeIdentifierList = this.identifiers.get(nodeIdentifierKey);
    const mainIdentifierList = this.identifiers.get(mainFileIdentifierKey);

    const nodeIdentifier = new Identifier(typeStr, nodeIdentifierKey);
    const mainIdentifier = new Identifier(typeStr, mainFileIdentifierKey);

    // console.log('🚀 ~ file: schema-extractor-context.ts:392 ~ SchemaExtractorContext ~ nodeIdentifier', nodeIdentifier);
    // console.log('🚀 ~ file: schema-extractor-context.ts:394 ~ SchemaExtractorContext ~ mainIdentifier', mainIdentifier);

    const parsedNodeIdentifier = nodeIdentifierList?.find(nodeIdentifier);
    const parsedMainIdentifier = mainIdentifierList?.find(mainIdentifier);
    // console.log(
    //   '🚀 ~ file: schema-extractor-context.ts:398 ~ SchemaExtractorContext ~ parsedMainIdentifier',
    //   parsedMainIdentifier
    // );

    const isExportedIdentifier = parsedNodeIdentifier && ExportIdentifier.isExportIdentifier(parsedNodeIdentifier);
    const isExportedFromMain = parsedMainIdentifier && ExportIdentifier.isExportIdentifier(parsedMainIdentifier);
    // console.log(
    //   '🚀 ~ file: schema-extractor-context.ts:402 ~ SchemaExtractorContext ~ isExportedFromMain',
    //   isExportedFromMain
    // );

    if (!isExportedIdentifier) return undefined;

    // internal
    return new TypeRefSchema(location, typeStr, undefined, undefined, !isExportedFromMain);
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
    const comment = getTextOfJSDocComment(jsDoc.comment);
    const tags = jsDoc.tags ? await pMapSeries(jsDoc.tags, (tag) => tagParser(tag, this, this.formatter)) : undefined;
    return new DocSchema(location, jsDoc.getText(), comment, tags);
  }
}
