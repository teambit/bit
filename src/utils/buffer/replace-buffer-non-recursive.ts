/**
 * replace string with another string inside Buffer without converting it to string.
 * other npm packages, such as replace-buffer and buffer-replace are recursive, and as such,
 * when using huge files (more than 8.5K lines of code), it crushes with an error "Maximum call
 * stack size exceeded".
 */
export default function replaceBuffer(buffer: Buffer, oldStr: string, newStr: string): Buffer {
  if (!(buffer instanceof Buffer)) throw new Error(`replaceBuffer expect to get Buffer, got ${typeof buffer} instead`);
  if (!buffer.includes(oldStr)) return buffer;
  const bufferOldStr = Buffer.from(oldStr);
  const bufferOldStrLength = bufferOldStr.length;
  const bufferNewStr = Buffer.from(newStr);

  let idx = buffer.indexOf(oldStr);
  let bufferInProgress = Buffer.from('');
  let startingPoint = 0;

  while (idx !== -1) {
    const bufferStart = buffer.slice(startingPoint, idx);
    bufferInProgress = Buffer.concat([bufferInProgress, bufferStart, bufferNewStr]);
    startingPoint = idx + bufferOldStrLength;
    idx = buffer.indexOf(oldStr, idx + bufferOldStrLength);
  }
  const bufferEnd = buffer.slice(startingPoint, buffer.length);
  return Buffer.concat([bufferInProgress, bufferEnd]);
}
