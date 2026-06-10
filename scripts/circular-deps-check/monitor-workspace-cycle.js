#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASELINE_FILE = path.join(__dirname, 'workspace-cycle-baseline.json');

function getWorkspaceCycle() {
  try {
    const output = execSync('bit insights circular --json', { encoding: 'utf-8', cwd: path.join(__dirname, '../..') });
    const data = JSON.parse(output);

    if (!data || !data[0] || !data[0].data) {
      throw new Error('Invalid circular dependencies data structure');
    }

    const cycles = data[0].data;

    // Find the cycle containing teambit.workspace/workspace
    const workspaceCycle = cycles.find((cycle) =>
      cycle.some((component) => component.includes('teambit.workspace/workspace'))
    );

    if (!workspaceCycle) {
      throw new Error('No cycle found containing teambit.workspace/workspace');
    }

    // Clean component names (remove version numbers for comparison)
    const cleanComponents = workspaceCycle.map((component) => component.replace(/@[\d.]+$/, ''));

    return {
      components: cleanComponents,
      count: cleanComponents.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Error getting workspace cycle:', error.message);
    process.exit(1);
  }
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(BASELINE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('❌ Error loading baseline:', error.message);
    return null;
  }
}

function saveBaseline(cycleData) {
  try {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(cycleData, null, 2));
    console.log(`✅ Baseline saved: ${cycleData.count} components in workspace cycle`);
  } catch (error) {
    console.error('❌ Error saving baseline:', error.message);
    process.exit(1);
  }
}

function findDifferences(baseline, current) {
  const baselineSet = new Set(baseline.components);
  const currentSet = new Set(current.components);

  const added = current.components.filter((comp) => !baselineSet.has(comp));
  const removed = baseline.components.filter((comp) => !currentSet.has(comp));

  return { added, removed };
}

function main() {
  const args = process.argv.slice(2);
  const isBaseline = args.includes('--baseline');
  const isVerbose = args.includes('--verbose');

  console.log('🔍 Monitoring workspace cycle...\n');

  const currentCycle = getWorkspaceCycle();

  if (isVerbose) {
    console.log(`📊 Current workspace cycle: ${currentCycle.count} components`);
    console.log(`⏰ Timestamp: ${currentCycle.timestamp}\n`);
  }

  if (isBaseline) {
    saveBaseline(currentCycle);
    return;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.log('⚠️  No baseline found. Run with --baseline to create one.');
    console.log(`📊 Current workspace cycle: ${currentCycle.count} components`);
    process.exit(1);
  }

  if (isVerbose) {
    console.log(`📋 Baseline: ${baseline.count} components (${baseline.timestamp})`);
    console.log(`📊 Current:  ${currentCycle.count} components (${currentCycle.timestamp})\n`);
  }

  if (currentCycle.count === baseline.count) {
    console.log(`✅ PASS: Workspace cycle stable at ${currentCycle.count} components`);
    process.exit(0);
  }

  if (currentCycle.count < baseline.count) {
    const reduction = baseline.count - currentCycle.count;
    console.log(`🎉 IMPROVEMENT: Workspace cycle reduced by ${reduction} components!`);
    console.log(`   ${baseline.count} → ${currentCycle.count} components\n`);

    const diff = findDifferences(baseline, currentCycle);
    if (diff.removed.length > 0) {
      console.log(`=== REMOVED from cycle (${diff.removed.length}) ===`);
      diff.removed.forEach((comp, i) => {
        console.log(`${i + 1}. ${comp}`);
      });
    }

    console.log('\n🔄 Consider updating baseline with: --baseline');
    process.exit(0);
  }

  // Cycle grew - this is bad
  const increase = currentCycle.count - baseline.count;
  console.log(`❌ FAIL: Workspace cycle grew by ${increase} components`);
  console.log(`   ${baseline.count} → ${currentCycle.count} components\n`);

  const diff = findDifferences(baseline, currentCycle);

  if (diff.added.length > 0) {
    console.log(`=== ADDED to cycle (${diff.added.length}) ===`);
    diff.added.forEach((comp, i) => {
      console.log(`${i + 1}. ${comp}`);
    });
  }

  if (diff.removed.length > 0) {
    console.log(`\n=== REMOVED from cycle (${diff.removed.length}) ===`);
    diff.removed.forEach((comp, i) => {
      console.log(`${i + 1}. ${comp}`);
    });
  }

  console.log('\n💡 The workspace cycle should not grow. Please investigate the added components.');
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { getWorkspaceCycle, loadBaseline, saveBaseline, findDifferences };
