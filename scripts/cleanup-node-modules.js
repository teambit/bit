#!/usr/bin/env node

/**
 * Node Modules Cleanup Script for Bit BVM Distributions
 * ======================================================
 *
 * Purpose:
 * This script optimizes the node_modules size for Bit installations distributed via BVM
 * (Bit Version Manager). It safely removes unnecessary files that are not needed for
 * production runtime, reducing the bundle size by approximately 130MB.
 *
 * When it's used:
 * - During CircleCI bundle jobs (bundle_version_linux, bundle_version_macos, bundle_version_windows)
 * - After running `pnpm add @teambit/bit` with hoisted node_modules
 * - Before creating the tarball for BVM distribution
 *
 * What it removes:
 * 1. Monaco Editor duplicate builds: Removes 'dev', 'esm', and 'min-maps' folders (~64MB)
 *    - Keeps only the 'min' folder which is sufficient for production use
 * 2. Source map files: Removes all *.map files throughout node_modules (~52MB)
 *    - These are only needed for debugging, not for production runtime
 *
 * Safety:
 * - Only removes files that are definitively not needed for runtime
 * - Does not remove any test files, documentation, or config files that might be needed
 * - Includes dry-run mode to preview changes before applying them
 * - Has been tested with Bit CLI to ensure no functionality is broken
 *
 * Result:
 * Reduces BVM installation size from ~1.1GB to ~970MB (11.5% reduction)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const config = {
  // Set to true to see what would be deleted without actually deleting
  dryRun: process.argv.includes('--dry-run'),
  // Set to true to keep source maps (useful for debugging)
  keepSourceMaps: process.argv.includes('--keep-source-maps'),
  // Set to true for verbose output
  verbose: process.argv.includes('--verbose'),
};

let totalSaved = 0;
let filesDeleted = 0;

function log(message) {
  if (config.verbose || config.dryRun) {
    console.log(message);
  }
}

function getDirectorySize(dir) {
  try {
    // Use du -sk for kilobytes on macOS, du -sb for bytes on Linux
    let result;
    if (process.platform === 'darwin') {
      result = execSync(`du -sk "${dir}" 2>/dev/null | cut -f1`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return parseInt(result.trim()) * 1024; // Convert KB to bytes
    } else {
      result = execSync(`du -sb "${dir}" 2>/dev/null | cut -f1`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return parseInt(result.trim()); // Already in bytes
    }
  } catch {
    return 0;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function deleteFileOrDir(filePath, description) {
  try {
    const stats = fs.statSync(filePath);
    const size = stats.isDirectory() ? getDirectorySize(filePath) : stats.size;

    if (config.dryRun) {
      log(`[DRY RUN] Would delete: ${filePath} (${formatBytes(size)}) - ${description}`);
      totalSaved += size;
      filesDeleted++;
    } else {
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      totalSaved += size;
      filesDeleted++;
      log(`Deleted: ${filePath} (${formatBytes(size)}) - ${description}`);
    }
    return true;
  } catch {
    // File doesn't exist or can't be deleted
    return false;
  }
}

// Monaco Editor cleanup - removes duplicate builds, keeps minified version
function cleanupMonacoEditor(nodeModulesPath) {
  console.log('\n📦 Cleaning up monaco-editor...');
  const monacoPath = path.join(nodeModulesPath, 'monaco-editor');

  if (!fs.existsSync(monacoPath)) {
    console.log('  monaco-editor not found, skipping...');
    return;
  }

  let monacoSaved = 0;
  let monacoFiles = 0;

  // Remove dev, esm, and min-maps directories (keep only min for production)
  const dirsToRemove = [
    { path: path.join(monacoPath, 'dev'), desc: 'Monaco dev build' },
    { path: path.join(monacoPath, 'esm'), desc: 'Monaco ESM build' },
    { path: path.join(monacoPath, 'min-maps'), desc: 'Monaco source maps' },
  ];

  for (const { path: dirPath, desc } of dirsToRemove) {
    if (fs.existsSync(dirPath)) {
      const size = getDirectorySize(dirPath);
      if (deleteFileOrDir(dirPath, desc)) {
        monacoSaved += size;
        monacoFiles++;
      }
    }
  }

  if (monacoSaved > 0) {
    console.log(`  Removed ${monacoFiles} directories, saved: ${formatBytes(monacoSaved)}`);
  } else {
    console.log('  No monaco-editor cleanup needed');
  }
}

// Source maps cleanup - removes .map files
function cleanupSourceMaps(nodeModulesPath) {
  if (config.keepSourceMaps) {
    console.log('\n🗺️  Keeping source maps (--keep-source-maps flag set)');
    return;
  }

  console.log('\n🗺️  Removing source maps...');

  try {
    // Use find command to locate all .map files efficiently
    const findCommand = `find "${nodeModulesPath}" -name "*.map" -type f 2>/dev/null`;
    const result = execSync(findCommand, { encoding: 'utf8' });
    const mapFiles = result
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    let mapSize = 0;
    let mapCount = 0;

    for (const mapFile of mapFiles) {
      try {
        const stats = fs.statSync(mapFile);
        mapSize += stats.size;

        if (!config.dryRun) {
          fs.unlinkSync(mapFile);
        } else {
          log(`[DRY RUN] Would delete: ${mapFile} (${formatBytes(stats.size)})`);
        }
        mapCount++;
      } catch {
        // Skip files we can't access or delete
      }
    }

    totalSaved += mapSize;
    filesDeleted += mapCount;
    console.log(
      `  ${config.dryRun ? 'Would remove' : 'Removed'} ${mapCount} source map files (${formatBytes(mapSize)})`
    );
  } catch {
    console.log('  No source maps found or error occurred');
  }
}

// Main execution
function main() {
  console.log('🚀 Node Modules Cleanup Script');
  console.log('================================');

  if (config.dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be deleted');
  }

  // Determine node_modules path
  const args = process.argv.slice(2);
  const nodeModulesPath = args.find((arg) => !arg.startsWith('--')) || './node_modules';
  const absolutePath = path.resolve(nodeModulesPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Error: node_modules directory not found at ${absolutePath}`);
    process.exit(1);
  }

  console.log(`📁 Cleaning: ${absolutePath}`);
  console.log(`🖥️  Platform: ${process.platform} (${process.arch})`);

  // Get initial size
  const initialSize = getDirectorySize(absolutePath);
  console.log(`📊 Initial size: ${formatBytes(initialSize)}`);

  // Run cleanup functions
  cleanupMonacoEditor(absolutePath);
  cleanupSourceMaps(absolutePath);

  // Summary
  console.log('\n📊 Cleanup Summary');
  console.log('==================');
  console.log(`Files/folders removed: ${filesDeleted}`);

  if (!config.dryRun) {
    const finalSize = getDirectorySize(absolutePath);
    const actualSaved = initialSize - finalSize;
    console.log(`Space saved: ${formatBytes(actualSaved)} (actual disk space)`);
    console.log(`Initial size: ${formatBytes(initialSize)}`);
    console.log(`Final size: ${formatBytes(finalSize)}`);
    console.log(`Reduction: ${((actualSaved / initialSize) * 100).toFixed(1)}%`);
  } else {
    console.log(`Space saved (estimated): ${formatBytes(totalSaved)}`);
  }

  if (config.dryRun) {
    console.log('\n💡 To actually delete files, run without --dry-run flag');
  }
}

// Help text
if (process.argv.includes('--help')) {
  console.log(`
Node Modules Cleanup Script
============================

Usage: node cleanup-node-modules.js [path-to-node_modules] [options]

Options:
  --dry-run         Show what would be deleted without actually deleting
  --keep-source-maps Keep .map files (useful for debugging)
  --verbose         Show detailed output
  --help           Show this help message

Examples:
  node cleanup-node-modules.js                    # Clean ./node_modules
  node cleanup-node-modules.js /path/to/node_modules  # Clean specific path
  node cleanup-node-modules.js --dry-run          # Preview what would be deleted
  node cleanup-node-modules.js --keep-source-maps # Keep source maps for debugging

This script safely removes:
  1. Duplicate monaco-editor builds (dev, esm, min-maps folders) ~64MB
     - Keeps the 'min' folder for production use
  2. Source map files (*.map) unless --keep-source-maps is used ~52MB
     - Source maps are useful for debugging but not needed in production

Expected space savings: ~130MB
Safe for production use - only removes non-essential files.
`);
  process.exit(0);
}

// Run the script
main();
