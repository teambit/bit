// Preparation only: observe published preimages without changing clocks or callback behavior.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const directory = process.env.BITMAP_HISTORY_ORACLE_DIRECTORY;
const root = process.env.BITMAP_HISTORY_ORACLE_ROOT;
const published = createRequire(path.join(process.env.BITMAP_HISTORY_ORACLE_PACKAGE, 'package.json'));
const { Consumer } = published('@teambit/legacy.consumer');
const original = Consumer.prototype.backupBitMap;
let sequence = 0;
const read = filename => {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error(`unbounded/nonregular oracle input ${filename}`);
  return { bytes: fs.readFileSync(filename), mode: stat.mode & 0o7777 };
};
const metadata = filename => fs.existsSync(filename) ? read(filename).bytes : Buffer.alloc(0);
const journal = value => fs.appendFileSync(path.join(directory, 'transitions.jsonl'), JSON.stringify(value) + '\n');
Consumer.prototype.backupBitMap = async function (...arguments_) {
  if (!this.bitMap.hasChanged) return Reflect.apply(original, this, arguments_);
  const row = { sequence: sequence++, reason: arguments_[0] || '' };
  let before;
  let prior;
  try {
    if (path.resolve(this.bitMap.mapPath) !== path.join(root, '.bitmap')) throw new Error('unexpected oracle workspace');
    before = read(this.bitMap.mapPath);
    prior = metadata(this.getBitmapHistoryMetadataPath());
    row.preimage_hex = before.bytes.toString('hex');
    row.mode = before.mode;
  } catch (error) {
    row.capture_error = error.message;
  }
  let result;
  try {
    result = await Reflect.apply(original, this, arguments_);
  } catch (error) {
    journal({ ...row, original_error: error.message });
    throw error;
  }
  try {
    if (!before || !prior) throw new Error('missing oracle preimage');
    const after = metadata(this.getBitmapHistoryMetadataPath());
    if (!after.subarray(0, prior.length).equals(prior)) throw new Error('oracle metadata prefix changed');
    const appended = after.subarray(prior.length).toString('utf8');
    const match = /^(\d{4}(?:-\d{1,2}){5}) ([^\r\n]*)\n$/.exec(appended);
    if (!match || match[2] !== row.reason) throw new Error('oracle backup did not append exactly one expected reason');
    const backup = read(path.join(this.getBitmapHistoryDir(), `.bitmap-${match[1]}`));
    if (!backup.bytes.equals(before.bytes) || backup.mode !== before.mode) throw new Error('oracle backup differs from disk preimage/mode');
    row.identity = match[1];
    row.raw_metadata_line = appended;
    row.backup_mode = backup.mode;
  } catch (error) {
    row.validation_error = error.message;
  }
  journal(row);
  return result;
};
