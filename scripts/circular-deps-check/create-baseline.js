#!/usr/bin/env node

/**
 * Creates a baseline from the master branch (or a clean state)
 * This should be run when you want to establish a new baseline
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const baselineFile = path.join(__dirname, 'baseline-cycles-full.json');

console.log('Creating baseline from current state...');
console.log('⚠️  Make sure you are on a clean master branch or desired baseline state!');

try {
  // Get current git status
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
  if (gitStatus.trim()) {
    console.log('\n⚠️  WARNING: You have uncommitted changes:');
    console.log(gitStatus);
    console.log('\nThis baseline will include your local changes.');
    console.log('Consider committing or stashing changes first.\n');
  }

  // Run bit graph and save as baseline
  console.log('Running bit graph --json --cycles...');
  const graphOutput = execSync('bit graph --json --cycles', {
    encoding: 'utf8',
    cwd: path.join(__dirname, '../..'),
    timeout: 300000, // 5 minutes
  });

  const graphData = JSON.parse(graphOutput);

  // Save to baseline file
  fs.writeFileSync(baselineFile, JSON.stringify(graphData, null, 2));

  const cycleCount = graphData.edges ? graphData.edges.length : 0;
  console.log(`✅ Baseline created: ${cycleCount} cycles`);
  console.log(`📁 Saved to: ${baselineFile}`);
  console.log('\nNow you can run the check script against this baseline.');
} catch (error) {
  console.error('❌ Error creating baseline:', error.message);
  process.exit(1);
}
