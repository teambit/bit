import ts from 'typescript';

export class EmptyLineEncoder {
  static readonly defaultEmptyLineMarker: string = '!--empty-line--!';
  static readonly defaultNewLine: string = '\r\n';
  constructor(emptyLineMarker?: string, newLine?: string) {
    this.emptyLineMarker = emptyLineMarker || EmptyLineEncoder.defaultEmptyLineMarker;
    this.newLine = newLine || EmptyLineEncoder.defaultNewLine;
  }
  emptyLineMarker: string;
  newLine: string;

  encode(text: string) {
    return encodeEmptyLines(text, this.emptyLineMarker, this.newLine);
  }
  decode(text: string) {
    return decodeEmptyLines(text, this.emptyLineMarker, this.newLine);
  }
  addLeadingEmptyLineMarker<T extends ts.Node>(node: T) {
    return addLeadingEmptyLineMarker(node, this.emptyLineMarker);
  }
}

export function encodeEmptyLines(text: string, emptyLineMarker?: string, newLine?: string) {
  const marker = toComment(emptyLineMarker || EmptyLineEncoder.defaultEmptyLineMarker);

  const lines = text.split(/\r?\n/);

  const commentedLines = lines.map((line) => (line.trim() === '' ? marker : line));

  return commentedLines.join(newLine || EmptyLineEncoder.defaultNewLine);
}

export function decodeEmptyLines(text: string, emptyLineMarker?: string, newLine?: string) {
  const marker = toComment(emptyLineMarker || EmptyLineEncoder.defaultEmptyLineMarker);

  const lines = text.split(/\r?\n/);

  const uncommentedLines = lines.map((line) => (line.trim() === marker ? '' : line));

  return uncommentedLines.join(newLine || EmptyLineEncoder.defaultNewLine);
}

export function addLeadingEmptyLineMarker<T extends ts.Node>(node: T, emptyLineMarker?: string) {
  return ts.addSyntheticLeadingComment(
    node,
    ts.SyntaxKind.MultiLineCommentTrivia,
    emptyLineMarker || EmptyLineEncoder.defaultEmptyLineMarker,
    // hasTrailingNewLine
    true
  );
}

function toComment(marker: string) {
  return `/*${marker}*/`;
}
