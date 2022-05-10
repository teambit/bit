import { TsserverClient } from '@teambit/ts-server';
import ts, { ExportDeclaration, Node, TypeNode } from 'typescript';
import { getTokenAtPosition } from 'tsutils';
import { head } from 'lodash';
// @ts-ignore david we should figure fix this.
import type { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { resolve, sep } from 'path';
import { Component } from '@teambit/component';
import { TypeRefSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { TypeScriptExtractor } from './typescript.extractor';
import { ExportList } from './export-list';
import { typeNodeToSchema } from './transformers/utils/type-node-to-schema';

export class SchemaExtractorContext {
  constructor(
    readonly tsserver: TsserverClient,
    readonly component: Component,
    readonly extractor: TypeScriptExtractor
  ) {}

  computeSchema(node: Node) {
    return this.extractor.computeSchema(node, this);
  }

  /**
   * returns the location of a node in a source file.
   */
  getLocation(node: Node, targetSourceFile?: ts.SourceFile) {
    const sourceFile = targetSourceFile || node.getSourceFile();
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const line = position.line + 1;
    const character = position.character + 1;

    return {
      line,
      character,
    };
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

  /**
   * create a reference to a type from a component.
   * think if we don't need this because of type ref
   */
  // createRef() {
  //   return {};
  // }

  getQuickInfo(node: Node) {
    return this.tsserver.getQuickInfo(this.getPath(node), this.getLocation(node));
  }

  /**
   * returns the type definition for a type.
   */
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
  private getSourceFile(filePath: string) {
    const file = this.findFileInComponent(filePath);
    if (!file) return undefined;
    return this.extractor.parseSourceFile(file);
  }

  async getSourceFileFromNode(node: Node) {
    const def = await this.tsserver.getDefinition(this.getPath(node), this.getLocation(node));

    const firstDef = head(def.body);
    if (!firstDef) {
      return undefined;
    }

    const sourceFile = this.getSourceFile(firstDef.file);

    return sourceFile;
  }

  /**
   * get a definition for a given node.
   */
  async definition(node: Node): Promise<Node | undefined> {
    const def = await this.tsserver.getDefinition(this.getPath(node), this.getLocation(node));

    const firstDef = head(def.body);
    if (!firstDef) {
      return undefined;
    }

    const startPosition = firstDef.start;
    const sourceFile = this.getSourceFile(firstDef.file);
    if (!sourceFile) {
      return undefined; // learn how to return a reference to a different component here.
    }
    const pos = this.getPosition(sourceFile, startPosition.line, startPosition.offset);
    const nodeAtPos = getTokenAtPosition(sourceFile, pos);
    return nodeAtPos;
  }

  /**
   * visit a definition for node - e.g. return it's schema.
   */
  async visitDefinition(node: Node): Promise<SchemaNode | undefined> {
    const definition = await this.definition(node);
    if (!definition) {
      return undefined;
    }
    return this.visit(definition.parent);
  }

  async visit(node: Node): Promise<SchemaNode> {
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

  async jump(file: AbstractVinyl, start: any): Promise<SchemaNode | undefined> {
    const sourceFile = this.extractor.parseSourceFile(file);
    const pos = this.getPosition(sourceFile, start.line, start.offset);
    const nodeAtPos = getTokenAtPosition(sourceFile, pos);
    if (!nodeAtPos) return undefined;
    if (nodeAtPos.kind === ts.SyntaxKind.Identifier) {
      // @todo: make sure with Ran that it's fine. Maybe it's better to do: `this.visit(nodeAtPos.parent);`
      return this.visitDefinition(nodeAtPos);
    }
    return this.visit(nodeAtPos);
  }

  /**
   * resolve a type by a node and its identifier.
   */
  async resolveType(node: Node & { type?: TypeNode }, typeStr: string): Promise<SchemaNode> {
    if (node.type && ts.isTypeNode(node.type)) {
      // if a node has "type" prop, it has the type data of the node. this normally happens when the code has the type
      // explicitly, e.g. `const str: string` vs implicitly `const str = 'some-string'`, which the node won't have "type"
      return typeNodeToSchema(node.type, this);
    }
    if (this._exports?.includes(typeStr)) return new TypeRefSchema(typeStr);

    /**
     * tsserver has two different calls: "definition" and "typeDefinition".
     * normally, we need the "typeDefinition" to get the type data of a node.
     * sometimes, it has no data, for example when the node is of type TypeReference, and then using "definition" is
     * helpful. (couldn't find a rule when to use each one. e.g. "VariableDeclaration" sometimes has data only in
     * "definition" but it's not clear when/why).
     */
    const getDef = async () => {
      const typeDefinition = await this.typeDefinition(node);
      const headTypeDefinition = head(typeDefinition?.body);
      if (headTypeDefinition) {
        return headTypeDefinition;
      }
      const definition = await this.tsserver.getDefinition(node.getSourceFile().fileName, this.getLocation(node));
      return head(definition?.body);
    };
    const definition = await getDef();

    // when we can't figure out the component/package/type of this node, we'll use the typeStr as the type.
    const unknownExactType = new TypeRefSchema(typeStr);
    if (!definition) {
      return unknownExactType;
    }

    // the reason for this check is to avoid infinite loop when calling `this.jump` with the same file+location
    const isDefInSameLocation = () => {
      if (definition.file !== node.getSourceFile().fileName) {
        return false;
      }
      const loc = this.getLocation(node);
      return loc.line === definition.start.line && loc.character === definition.start.offset;
    };

    const file = this.findFileInComponent(definition.file);
    if (file) {
      if (isDefInSameLocation()) {
        return unknownExactType;
      }
      return new TypeRefSchema(typeStr, undefined, undefined, await this.jump(file, definition.start));
    }
    const pkgName = this.parsePackageNameFromPath(definition.file);
    // TODO: find component id is exists, otherwise add the package name.
    return new TypeRefSchema(typeStr, undefined, pkgName);
  }
}
