#!/usr/bin/env node

/**
 * Circular Dependencies Checker for Bit Repository
 *
 * This script measures circular dependencies and ensures no regressions occur.
 * It runs "bit graph --json --cycles" and counts the circular dependencies.
 *
 * Usage:
 *   node check-circular-deps.js [--baseline] [--max-cycles=N] [--verbose]
 *
 * Options:
 *   --baseline: Save current cycle count as the baseline
 *   --max-cycles=N: Set maximum allowed cycles (overrides baseline)
 *   --verbose: Show detailed output
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASELINE_FILE = path.join(__dirname, 'baseline-cycles.json');

function runBitGraphCycles() {
  try {
    console.log('Running bit graph --json --cycles...');
    console.log('(This may take a few minutes for large repositories)');

    const output = execSync('bit graph --json --cycles', {
      encoding: 'utf8',
      cwd: path.join(__dirname, '../..'),
      stdio: ['inherit', 'pipe', 'inherit'],
      timeout: 300000, // 5 minutes timeout
    });

    console.log('✅ Graph analysis completed');
    return JSON.parse(output);
  } catch (error) {
    if (error.code === 'TIMEOUT') {
      console.error('Error: bit graph command timed out after 5 minutes');
      console.error('This might indicate the repository is too large or has performance issues');
    } else {
      console.error('Error running bit graph --cycles:', error.message);
    }
    process.exit(1);
  }
}

function countCircularDependencies(graphData) {
  if (!graphData || !graphData.edges) {
    console.error('Invalid graph data structure');
    process.exit(1);
  }

  return graphData.edges.length;
}

function getUniqueComponents(graphData) {
  const components = new Set();

  if (graphData.edges) {
    graphData.edges.forEach((edge) => {
      components.add(edge.sourceId);
      components.add(edge.targetId);
    });
  }

  return components.size;
}

function analyzeCircularDependencies(graphData, verbose = false) {
  const totalCycles = countCircularDependencies(graphData);
  const uniqueComponents = getUniqueComponents(graphData);

  const analysis = {
    totalCycles,
    uniqueComponents,
    timestamp: new Date().toISOString(),
  };

  if (verbose) {
    console.log('\n=== Circular Dependencies Analysis ===');
    console.log(`Total circular dependency edges: ${totalCycles}`);
    console.log(`Unique components involved: ${uniqueComponents}`);
    console.log(`Timestamp: ${analysis.timestamp}`);

    if (graphData.edges && graphData.edges.length > 0) {
      console.log('\n=== Sample Circular Dependencies ===');
      const sampleSize = Math.min(10, graphData.edges.length);
      for (let i = 0; i < sampleSize; i++) {
        const edge = graphData.edges[i];
        console.log(`${edge.sourceId} → ${edge.targetId}`);
      }
      if (graphData.edges.length > 10) {
        console.log(`... and ${graphData.edges.length - 10} more cycles`);
      }
    }
  }

  return analysis;
}

function saveBaseline(analysis) {
  try {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(analysis, null, 2));
    console.log(`✅ Baseline saved: ${analysis.totalCycles} cycles, ${analysis.uniqueComponents} components`);
  } catch (error) {
    console.error(`Error saving baseline: ${error.message}`);
    process.exit(1);
  }
}

function loadBaseline() {
  try {
    if (!fs.existsSync(BASELINE_FILE)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch (error) {
    console.error(`Error loading baseline: ${error.message}`);
    return null;
  }
}

function checkAgainstBaseline(current, baseline, maxCycles = null) {
  const allowedCycles = maxCycles !== null ? maxCycles : baseline.totalCycles;

  console.log('\n=== Circular Dependencies Check ===');
  console.log(`Current cycles: ${current.totalCycles}`);
  console.log(`Current components: ${current.uniqueComponents}`);

  if (baseline) {
    console.log(`Baseline cycles: ${baseline.totalCycles}`);
    console.log(`Baseline components: ${baseline.uniqueComponents}`);

    const cyclesDiff = current.totalCycles - baseline.totalCycles;
    const componentsDiff = current.uniqueComponents - baseline.uniqueComponents;

    if (cyclesDiff !== 0) {
      console.log(`Cycles change: ${cyclesDiff > 0 ? '+' : ''}${cyclesDiff}`);
    }
    if (componentsDiff !== 0) {
      console.log(`Components change: ${componentsDiff > 0 ? '+' : ''}${componentsDiff}`);
    }
  }

  console.log(`Allowed cycles: ${allowedCycles}`);

  if (current.totalCycles <= allowedCycles) {
    console.log(`✅ PASS: ${current.totalCycles} cycles <= ${allowedCycles} allowed`);
    return true;
  } else {
    console.log(`❌ FAIL: ${current.totalCycles} cycles > ${allowedCycles} allowed`);
    console.log(`\nCircular dependencies have increased beyond the allowed threshold.`);
    console.log(`Please fix the circular dependencies before merging.`);
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const shouldSaveBaseline = args.includes('--baseline');

  let maxCycles = null;
  const maxCyclesArg = args.find((arg) => arg.startsWith('--max-cycles='));
  if (maxCyclesArg) {
    maxCycles = parseInt(maxCyclesArg.split('=')[1]);
    if (isNaN(maxCycles)) {
      console.error('Error: --max-cycles must be a number');
      process.exit(1);
    }
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Circular Dependencies Checker for Bit Repository

Usage:
  node check-circular-deps.js [OPTIONS]

Options:
  --baseline              Save current cycle count as the baseline
  --max-cycles=N         Set maximum allowed cycles (overrides baseline)
  --verbose              Show detailed output including sample cycles
  --help, -h             Show this help message

Examples:
  node check-circular-deps.js --baseline --verbose
  node check-circular-deps.js --max-cycles=100
  node check-circular-deps.js --verbose
`);
    process.exit(0);
  }

  // Run the analysis
  const graphData = runBitGraphCycles();
  const current = analyzeCircularDependencies(graphData, verbose);

  if (shouldSaveBaseline) {
    saveBaseline(current);
    return;
  }

  // Load baseline and check
  const baseline = loadBaseline();

  if (!baseline && maxCycles === null) {
    console.log('\n⚠️  No baseline found and no --max-cycles specified.');
    console.log('Run with --baseline to save current state as baseline.');
    console.log(`Current state: ${current.totalCycles} cycles, ${current.uniqueComponents} components`);
    process.exit(0);
  }

  const passed = checkAgainstBaseline(current, baseline, maxCycles);

  if (!passed) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyzeCircularDependencies, countCircularDependencies, getUniqueComponents };
