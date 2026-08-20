#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

try {
  // Read the version of teambit.harmony/bit from .bitmap - at commit time it already
  // holds the version that was just tagged (and published to npm) by `bit ci merge`.
  // Querying npm here instead is racy: the registry read endpoints may lag the publish
  // by seconds to minutes, which used to produce commit messages one release behind.
  const bitmapRaw = fs.readFileSync(path.join(__dirname, '..', '.bitmap'), 'utf8');
  const bitmapJson = bitmapRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  const bitmap = JSON.parse(bitmapJson);
  const version = bitmap.bit.version;
  if (!version) throw new Error('bit entry has no version');

  console.log(`bump teambit version to ${version} [skip ci]`);
} catch {
  // Fallback to default message if version lookup fails
  console.log('chore: update .bitmap and lockfiles as needed [skip ci]');
}
