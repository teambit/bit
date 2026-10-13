// Deliberately accepts only the declared flat, regular USTAR members produced here.
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_EXPANDED = 80 * 1024 * 1024;
const names = ['LICENSE', 'THIRD-PARTY-NOTICES.txt', 'bit-object-import', 'manifest.json'];
const allowed = new Set([...names, 'bit-object-import.exe', 'bit-workspace.node']);
const sum = (header) => header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
const octal = (buffer, offset, length, value) =>
  buffer.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');

function encode(members) {
  const blocks = [];
  for (const name of Object.keys(members).sort()) {
    assert.ok(allowed.has(name));
    const data = members[name];
    const header = Buffer.alloc(512);
    header.write(name);
    octal(header, 100, 8, name.startsWith('bit-object-import') ? 0o755 : 0o644);
    octal(header, 108, 8, 0);
    octal(header, 116, 8, 0);
    octal(header, 124, 12, data.length);
    octal(header, 136, 12, 0);
    header[156] = 48;
    header.write('ustar\0', 257);
    header.write('00', 263);
    octal(header, 148, 7, sum(header));
    header[155] = 32;
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  const expanded = Buffer.concat(blocks);
  assert.ok(expanded.length <= MAX_EXPANDED, 'expanded artifact exceeds limit');
  const compressed = zlib.gzipSync(expanded, { level: 9 });
  assert.ok(compressed.length <= MAX_ARCHIVE, 'compressed artifact exceeds limit');
  return compressed;
}

function decode(compressed) {
  assert.ok(compressed.length <= MAX_ARCHIVE, 'compressed artifact exceeds limit');
  const data = zlib.gunzipSync(compressed, { maxOutputLength: MAX_EXPANDED });
  const members = Object.create(null);
  let offset = 0;
  const text = (header, start, length) =>
    header
      .subarray(start, start + length)
      .toString('ascii')
      .replace(/\0.*$/s, '');
  const number = (header, start, length) => {
    const value = text(header, start, length).trim();
    assert.match(value, /^[0-7]+$/, 'invalid USTAR number');
    return parseInt(value, 8);
  };
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = text(header, 0, 100);
    assert.ok(allowed.has(name) && !Object.hasOwn(members, name), 'unexpected or duplicate artifact member');
    assert.equal(text(header, 257, 6), 'ustar', 'invalid USTAR magic');
    assert.equal(text(header, 263, 2), '00', 'invalid USTAR version');
    assert.equal(header[156], 48, 'artifact member must be regular');
    assert.equal(text(header, 157, 100), '', 'artifact links are forbidden');
    assert.equal(text(header, 345, 155), '', 'artifact prefixes are forbidden');
    assert.equal(number(header, 148, 8), sum(header), 'USTAR checksum mismatch');
    const length = number(header, 124, 12);
    offset += 512;
    assert.ok(length <= MAX_ARCHIVE && offset + length <= data.length, 'truncated or oversized member');
    members[name] = data.subarray(offset, offset + length);
    offset += Math.ceil(length / 512) * 512;
  }
  assert.ok(data.length - offset >= 1024 && data.length % 512 === 0, 'missing USTAR terminator');
  assert.ok(
    data.subarray(offset).every((byte) => byte === 0),
    'data after USTAR terminator'
  );
  assert.equal(Object.keys(members).length, Object.hasOwn(members, 'bit-workspace.node') ? 5 : 4, 'unexpected artifact member count');
  return members;
}
module.exports = { encode, decode, MAX_ARCHIVE };
