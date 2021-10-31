import { TsserverClient } from '@teambit/ts-server';
import ts, { Node } from 'typescript';
import { getTokenAtPosition } from 'tsutils';
import { head } from 'lodash';
import type { Position } from 'vscode-languageserver-types';
import { Component } from '@teambit/component';
import { TypeScriptExtractor } from './typescript.extractor';

export class SchemaExtractorContext {
  constructor(
    readonly tsserver: TsserverClient,
    readonly component: Component,
    readonly extractor: TypeScriptExtractor
  ) {}

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

  createRef(filePath: string) {
    return {};
  }

  getQuickInfo(node: Node) {
    return this.tsserver.getQuickInfo(this.getPath(node), this.getLocation(node));
  }

  /**
   * return the file if part of the component.
   * otherwise, a reference to the target package and the type name.
   */
  private getSourceFile(filePath: string) {
    const file = this.component.filesystem.files.find((file) => {
      return file.path === filePath;
    });

    if (!file) return;
    return this.extractor.parseSourceFile(file);
  }

  async definition(node: Node) {
    const def = await this.tsserver.getDefinition(this.getPath(node), this.getLocation(node));

    const firstDef = head(def.body);
    if (!firstDef) return;

    const startPosition = firstDef.start;
    const sourceFile = this.getSourceFile(firstDef.file);
    // if (!sourceFile) return this.createRef(firstDef.file);
    if (!sourceFile) return undefined; // learn how to return a reference to a different component here.
    const pos = this.getPosition(sourceFile, startPosition.line, startPosition.offset);
    const nodeAtPos = getTokenAtPosition(sourceFile, pos);
    return nodeAtPos;
  }

  async visitDefinition(node: Node) {
    const definition = await this.definition(node);
    if (!definition) return;
    return this.visit(definition.parent);
  }

  async visit(node: Node) {
    return this.extractor.computeSchema(node, this);
  }

  references() {}

  resolveType() {}
}
