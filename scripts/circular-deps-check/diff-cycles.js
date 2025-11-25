#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function normalizeEdgeId(edgeId) {
  // Remove version numbers to compare just the component relationships
  return edgeId.replace(/@[\d.]+/g, '');
}

function loadCycles(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Handle different JSON structures
  if (data.edges) {
    // Full graph format - normalize edge IDs to remove version numbers
    return new Set(data.edges.map((edge) => normalizeEdgeId(edge.id)));
  } else if (data.totalCycles !== undefined) {
    // Summary format (baseline-cycles.json) - need to regenerate with full data
    console.error('Baseline file is in summary format. Need full graph data for comparison.');
    console.error('Run: bit graph --json --cycles > baseline-cycles-full.json');
    process.exit(1);
  } else {
    console.error('Unknown JSON format in:', filePath);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  let baselinePath, currentPath;

  if (args.length >= 2) {
    baselinePath = args[0];
    currentPath = args[1];
  } else {
    // Default paths
    baselinePath = path.join(__dirname, 'baseline-cycles-full.json');
    currentPath = path.join(__dirname, 'fresh-cycles.json');
  }

  console.log('Loading baseline cycles from:', baselinePath);
  console.log('Loading current cycles from:', currentPath);

  const baselineCycles = loadCycles(baselinePath);
  const currentCycles = loadCycles(currentPath);

  // Find new cycles (in current but not in baseline)
  const newCycles = [...currentCycles].filter((cycle) => !baselineCycles.has(cycle));

  // Find removed cycles (in baseline but not in current)
  const removedCycles = [...baselineCycles].filter((cycle) => !currentCycles.has(cycle));

  console.log('\n=== Circular Dependencies Diff ===');
  console.log(`Baseline cycles: ${baselineCycles.size}`);
  console.log(`Current cycles: ${currentCycles.size}`);
  console.log(`Net change: ${currentCycles.size - baselineCycles.size}`);

  if (newCycles.length > 0) {
    console.log(`\n=== NEW Circular Dependencies (${newCycles.length}) ===`);
    newCycles.forEach((cycle, index) => {
      console.log(`${index + 1}. ${cycle}`);
    });
  }

  if (removedCycles.length > 0) {
    console.log(`\n=== REMOVED Circular Dependencies (${removedCycles.length}) ===`);
    removedCycles.forEach((cycle, index) => {
      console.log(`${index + 1}. ${cycle}`);
    });
  }

  if (newCycles.length === 0 && removedCycles.length === 0) {
    console.log('\n✅ No changes in circular dependencies');
  }
}

if (require.main === module) {
  main();
}
