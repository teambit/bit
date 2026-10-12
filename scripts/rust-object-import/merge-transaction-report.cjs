// Canonical three-way merge pushes added/updated rows after concurrent Source loads.
// Their completion order can differ between two unmodified Node runs. Preserve the
// raw report in evidence; compare only adjacent rows of the same asynchronous kind
// as a multiset. Headers, other statuses, paths, duplicate counts and bytes remain
// significant. Never reorder across a status or component boundary.
function comparableMergeStdout(stdout) {
  const lines = stdout.match(/[^\n]*\n|[^\n]+$/g) || [];
  const kind = (line) => /^\t(added|updated) [^\r\n]+(?:\r?\n|$)$/.exec(line)?.[1];
  for (let start = 0; start < lines.length; ) {
    const current = kind(lines[start]);
    let end = start + 1;
    if (current) while (end < lines.length && kind(lines[end]) === current) end++;
    if (end - start > 1) lines.splice(start, end - start, ...lines.slice(start, end).sort());
    start = end;
  }
  return lines.join('');
}
// VersionHistory stores a hash-keyed map as an array. Concurrent canonical
// population can insert independent heads in either order. Parent arrays and
// graphCompleteRefs remain ordered; only complete version rows are a multiset.
function comparableVersionHistory(hex) {
  const bytes = Buffer.from(hex, 'hex');
  if (!bytes.subarray(0, 15).equals(Buffer.from('VersionHistory '))) return hex;
  const separator = bytes.indexOf(0);
  if (separator < 0) return hex;
  const body = bytes.subarray(separator + 1).toString();
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return hex;
  }
  if (!Array.isArray(value.versions) || JSON.stringify(value) !== body) return hex;
  value.versions.sort((a, b) => {
    const left = JSON.stringify(a),
      right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return Buffer.concat([bytes.subarray(0, separator + 1), Buffer.from(JSON.stringify(value))]).toString('hex');
}
module.exports = { comparableMergeStdout, comparableVersionHistory };
