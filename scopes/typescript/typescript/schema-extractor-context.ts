import { TsserverClient } from '@teambit/ts-server';
import ts, { ExportDeclaration, Node } from 'typescript';
import { getTokenAtPosition } from 'tsutils';
import { head } from 'lodash';
import type { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { resolve } from 'path';
import { Component } from '@teambit/component';
import { TypeRefSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { TypeScriptExtractor } from './typescript.extractor';
import { ExportList } from './export-list';

export class SchemaExtractorContext {
  constructor(
    readonly tsserver: TsserverClient,
    readonly component: Component,
    readonly extractor: TypeScriptExtractor
  ) {}

  computeSchema(node: Node) {
    return this.extractor.computeSchema(node, this);
  }

  getLocation(node: Node, targetSourceFile?: ts.SourceFile) {
    const sourceFile = targetSourceFile || node.getSourceFile();
    const position = sourceFile.getLineAndCharacterOfPosition(node.pos);
    const line = position.line + 1;
    const character = position.character + 2; // need to verify why a 2 char difference here.

    return {
      line,
      character,
    };
  }

  async getSignature(node: Node) {
    return this.tsserver.getSignatureHelp(this.getPath(node), this.getLocation(node));
  }

  getPosition(sourceFile: ts.SourceFile, line: number, offset: number): number {
    return sourceFile.getPositionOfLineAndCharacter(line - 1, offset - 2);
  }

  getPath(node: Node) {
    const sourceFile = node.getSourceFile();
    return sourceFile.fileName;
  }

  createRef() {
    return {};
  }

  getQuickInfo(node: Node) {
    return this.tsserver.getQuickInfo(this.getPath(node), this.getLocation(node));
  }

  typeDefinition(node: Node) {
    return this.tsserver.getTypeDefinition(this.getPath(node), this.getLocation(node));
  }

  visitTypeDefinition() {}

  private findFileInComponent(filePath: string) {
    return this.component.filesystem.files.find((file) => {
      // TODO: fix this line to support further extensions.
      if (file.path.includes(filePath)) {
        const strings = ['ts', 'tsx', 'js', 'jsx'].map((format) => {
          if (filePath.endsWith(format)) return filePath;
          return `${filePath}.${format}`;
        });

        return strings.find((string) => string === file.path);
      }

      return false;
    });
  }

  /**
   * return the file if part of the component.
   * otherwise, a reference to the target package and the type name.
   */
  private getSourceFile(filePath: string) {
    const file = this.findFileInComponent(filePath);
    if (!file) return undefined;
    return this.extractor.parseSourceFile(file);
  }

  async definition(node: Node): Promise<Node | undefined> {
    const def = await this.tsserver.getDefinition(this.getPath(node), this.getLocation(node));

    const firstDef = head(def.body);
    if (!firstDef) return undefined;

    const startPosition = firstDef.start;
    const sourceFile = this.getSourceFile(firstDef.file);
    if (!sourceFile) return undefined; // learn how to return a reference to a different component here.
    const pos = this.getPosition(sourceFile, startPosition.line, startPosition.offset);
    const nodeAtPos = getTokenAtPosition(sourceFile, pos);
    return nodeAtPos;
  }

  async visitDefinition(node: Node): Promise<SchemaNode | undefined> {
    const definition = await this.definition(node);
    if (!definition) return undefined;
    return this.visit(definition.parent);
  }

  async visit(node: Node): Promise<SchemaNode | undefined> {
    return this.extractor.computeSchema(node, this);
  }

  references() {}

  isExported() {}

  isFromComponent() {}

  async getFileExports(exportDec: ExportDeclaration) {
    const file = exportDec.getSourceFile().fileName;
    const specifierPathStr = exportDec.moduleSpecifier?.getText() || '';
    const specifierPath = specifierPathStr.substring(1, specifierPathStr.length - 1);
    const absPath = resolve(file, '..', specifierPath);
    const sourceFile = this.getSourceFile(absPath);
    if (!sourceFile) return [];
    return this.extractor.computeExportedIdentifiers(sourceFile, this);
  }

  _exports: ExportList | undefined = undefined;

  setExports(exports: ExportList) {
    this._exports = exports;
    return this;
  }

  getExportedIdentifiers(node: Node) {
    return this.extractor.computeExportedIdentifiers(node, this);
  }

  private isNative(typeName: string) {
    return ['string', 'number', 'bool', 'boolean', 'object', 'any', 'void'].includes(typeName);
  }

  async jump(file: AbstractVinyl, start: any) {
    const sourceFile = this.extractor.parseSourceFile(file);
    const pos = this.getPosition(sourceFile, start.line, start.offset);
    const nodeAtPos = getTokenAtPosition(sourceFile, pos);
    if (!nodeAtPos) return undefined;
    return this.visit(nodeAtPos);
  }

  async resolveType(node: Node, typeStr: string, type = true): Promise<TypeRefSchema> {
    if (this.isNative(typeStr)) return new TypeRefSchema(typeStr);
    if (this._exports?.includes(typeStr)) return new TypeRefSchema(typeStr);

    const typeDef = type
      ? await this.tsserver.getDefinition(node.getSourceFile().fileName, this.getLocation(node))
      : await this.typeDefinition(node);

    const def = await Promise.all(
      typeDef?.body?.map(async (definition) => {
        const file = this.findFileInComponent(definition.file);
        // TODO: find component id is exists, otherwise add the package name.
        if (!file) return new TypeRefSchema(typeStr, undefined, '');
        if (file) return new TypeRefSchema(typeStr, undefined, undefined, this.jump(file, definition.start));
        return undefined;
      }) || []
    );

    const headDef = head(def);
    if (headDef) return headDef;
    return new TypeRefSchema('any');
  }
}
