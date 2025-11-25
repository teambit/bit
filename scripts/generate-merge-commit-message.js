#!/usr/bin/env node

const { execSync } = require('child_process');

try {
  // Get the current version of @teambit/bit from npm
  const version = execSync('npm show @teambit/bit version', { encoding: 'utf8' }).trim();

  // Generate the commit message with the version
  console.log(`bump teambit version to ${version} [skip ci]`);
} catch {
  // Fallback to default message if version lookup fails
  console.log('chore: update .bitmap and lockfiles as needed [skip ci]');
}
