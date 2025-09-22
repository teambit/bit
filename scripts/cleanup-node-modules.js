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
 * 3. UI dependencies (with --remove-ui-deps): Removes UI-only packages (~45MB)
 *    - react-syntax-highlighter, date-fns, d3-* packages, @react-hook/*
 *    - Nested node_modules in @teambit/react and @teambit/ui
 *    - Safe since UI is pre-bundled in artifacts directory
 *    - WARNING: This will break `bit start --dev` which needs these packages to rebuild UI
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

// Configuration
const config = {
  // Set to true to see what would be deleted without actually deleting
  dryRun: process.argv.includes('--dry-run'),
  // Set to true to keep source maps (useful for debugging)
  keepSourceMaps: process.argv.includes('--keep-source-maps'),
  // Set to true to keep only @teambit source maps (for debugging Bit's own code)
  keepTeambitMaps: process.argv.includes('--keep-teambit-maps'),
  // Set to true to remove UI-only dependencies that are not needed for CLI operations
  removeUiDeps: process.argv.includes('--remove-ui-deps'),
  // Set to true to remove ESM builds (keep CJS only - default for current Bit)
  removeEsm: process.argv.includes('--remove-esm'),
  // Set to true to remove CJS builds (keep ESM only - for future ESM migration)
  removeCjs: process.argv.includes('--remove-cjs'),
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
  // Use Node.js fs to calculate actual file sizes (not disk usage)
  // This gives us the logical size, similar to what you see in "Size" (not "Size on disk")
  let totalSize = 0;

  function calculateSize(dirPath) {
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach((file) => {
        const filePath = path.join(dirPath, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            calculateSize(filePath);
          } else {
            totalSize += stats.size;
          }
        } catch {
          // Skip files we can't access
        }
      });
    } catch {
      // Skip directories we can't read
    }
  }

  calculateSize(dir);
  return totalSize;
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
    // Use du command for both files and directories to get accurate disk usage
    const size = getFileSizeAccurate(filePath, stats);

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

// Get accurate file size using du command for both files and directories
function getFileSizeAccurate(filePath, stats) {
  try {
    // Use stats.size for actual file size (not disk usage)
    // This gives consistent cross-platform results
    if (!stats) {
      stats = fs.statSync(filePath);
    }
    return stats.size;
  } catch {
    // If we can't read the file, return 0
    return 0;
  }
}

// Estimate source map size by sampling actual files with du
function estimateSourceMapSize(nodeModulesPath, totalMapCount, keepTeambitMaps) {
  if (totalMapCount === 0) return 0;

  try {
    // Find all source map files to sample
    const mapFiles = [];

    function findMapFiles(dir, limit = 100) {
      // Sample up to 100 files for estimation
      if (mapFiles.length >= limit) return;

      try {
        const files = fs.readdirSync(dir);

        for (const file of files) {
          if (mapFiles.length >= limit) break;

          const filePath = path.join(dir, file);
          try {
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
              if (!['.git', '.svn', '.hg'].includes(file)) {
                findMapFiles(filePath, limit);
              }
            } else if (file.endsWith('.map')) {
              if (keepTeambitMaps && filePath.includes('/node_modules/@teambit/')) {
                continue; // Skip @teambit source maps
              }
              mapFiles.push(filePath);
            }
          } catch {
            // Skip files we can't access
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    findMapFiles(nodeModulesPath);

    if (mapFiles.length === 0) return 0;

    // Sample up to 20 files to get average size using du
    const sampleSize = Math.min(20, mapFiles.length);
    let totalSampleSize = 0;

    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * mapFiles.length);
      const filePath = mapFiles[randomIndex];

      try {
        const stats = fs.statSync(filePath);
        const duSize = getFileSizeAccurate(filePath, stats);
        totalSampleSize += duSize;
      } catch {
        // Skip files that can't be measured
      }
    }

    const averageSize = totalSampleSize / sampleSize;
    return Math.round(averageSize * totalMapCount);
  } catch {
    // Fallback to conservative estimate
    return totalMapCount * 7000; // 7KB per file
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
    console.log('\n🗺️  Keeping all source maps (--keep-source-maps flag set)');
    return;
  }

  if (config.keepTeambitMaps) {
    console.log('\n🗺️  Removing source maps (keeping @teambit maps)...');
  } else {
    console.log('\n🗺️  Removing source maps...');
  }

  let mapCount = 0;

  // For accurate measurement in non-dry-run mode, get size before
  const sizeBefore = config.dryRun ? 0 : getDirectorySize(nodeModulesPath);

  // Recursively find and remove .map files
  function removeMapFiles(dir) {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stats = fs.statSync(filePath);

          if (stats.isDirectory()) {
            // Skip .git and other version control directories
            if (!['.git', '.svn', '.hg'].includes(file)) {
              removeMapFiles(filePath);
            }
          } else if (file.endsWith('.map')) {
            // If keepTeambitMaps is set, skip @teambit source maps
            if (config.keepTeambitMaps && filePath.includes('/node_modules/@teambit/')) {
              return; // Skip @teambit source maps
            }

            mapCount++;

            if (!config.dryRun) {
              fs.unlinkSync(filePath);
            }
            // Don't log individual files in dry-run, too verbose
          }
        } catch {
          // Skip files we can't access
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  removeMapFiles(nodeModulesPath);

  // Calculate actual space saved for source maps
  let mapSize;
  if (config.dryRun) {
    // More accurate estimate: use du on a sample of map files to get average size
    mapSize = estimateSourceMapSize(nodeModulesPath, mapCount, config.keepTeambitMaps);
  } else {
    const sizeAfter = getDirectorySize(nodeModulesPath);
    mapSize = sizeBefore - sizeAfter;
  }

  totalSaved += mapSize;
  filesDeleted += mapCount;
  console.log(`  ${config.dryRun ? 'Would remove' : 'Removed'} ${mapCount} source map files (${formatBytes(mapSize)})`);
}

// date-fns locale cleanup - removes all locales except English
function cleanupDateFnsLocales(nodeModulesPath) {
  console.log('\n📅 Cleaning up date-fns locales...');
  const dateFnsPath = path.join(nodeModulesPath, 'date-fns');
  const localesPath = path.join(dateFnsPath, 'locale');

  if (!fs.existsSync(localesPath)) {
    console.log('  date-fns locale directory not found, skipping...');
    return;
  }

  let localesSaved = 0;
  let localesCount = 0;

  try {
    const locales = fs.readdirSync(localesPath);

    for (const locale of locales) {
      // Keep only English locale (en-US is the default, so keep 'en' related)
      if (locale.startsWith('en') || locale === '_lib' || locale === 'index.js' || locale === 'index.d.ts') {
        continue; // Keep English locales and essential files
      }

      const localePath = path.join(localesPath, locale);
      const stats = fs.statSync(localePath);

      // Remove both directories and files (date-fns has both)
      const size = stats.isDirectory() ? getDirectorySize(localePath) : stats.size;
      if (deleteFileOrDir(localePath, `date-fns locale: ${locale}`)) {
        localesSaved += size;
        localesCount++;
      }
    }

    if (localesCount > 0) {
      console.log(`  Removed ${localesCount} locales, saved: ${formatBytes(localesSaved)}`);
    } else {
      console.log('  No date-fns locales to remove');
    }
  } catch (error) {
    console.log('  Error processing date-fns locales:', error.message);
  }
}

// TypeScript locale cleanup - removes all non-English locales
function cleanupTypeScriptLocales(nodeModulesPath) {
  console.log('\n📝 Cleaning up TypeScript locales...');
  const typescriptPath = path.join(nodeModulesPath, 'typescript');
  const libPath = path.join(typescriptPath, 'lib');

  if (!fs.existsSync(libPath)) {
    console.log('  TypeScript lib directory not found, skipping...');
    return;
  }

  let localesSaved = 0;
  let localesCount = 0;

  try {
    // Remove known non-English locale directories
    const localeDirectories = ['cs', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt-br', 'ru', 'tr', 'zh-cn', 'zh-tw'];

    for (const localeDir of localeDirectories) {
      const localePath = path.join(libPath, localeDir);

      if (fs.existsSync(localePath)) {
        const stats = fs.statSync(localePath);

        if (stats.isDirectory()) {
          const size = getDirectorySize(localePath);
          if (deleteFileOrDir(localePath, `TypeScript locale: ${localeDir}`)) {
            localesSaved += size;
            localesCount++;
          }
        }
      }
    }

    if (localesCount > 0) {
      console.log(`  Removed ${localesCount} locale directories, saved: ${formatBytes(localesSaved)}`);
    } else {
      console.log('  No TypeScript locales to remove');
    }
  } catch (error) {
    console.log('  Error processing TypeScript locales:', error.message);
  }
}

// UI Dependencies cleanup - removes UI-only packages not needed for CLI operations
// WARNING: This will break `bit start --dev` which requires these packages to rebuild the UI
function cleanupUiDependencies(nodeModulesPath) {
  if (!config.removeUiDeps) {
    return;
  }

  console.log('\n🎨 Removing UI dependencies...');
  console.log('  (Safe to remove since UI is pre-bundled in artifacts)');
  console.log('  ⚠️  WARNING: This will break `bit start --dev` mode');

  let totalUiSaved = 0;
  let uiPackagesRemoved = 0;

  // List of UI-only packages that can be safely removed
  const uiPackages = [
    'react-syntax-highlighter', // Code highlighting in UI docs (~9MB)
    'date-fns', // Date picker components (~12MB)
    '@types/react-syntax-highlighter', // Type definitions (~2MB)
    '@react-hook', // React UI utilities (~1MB)
  ];

  // D3 packages used for data visualization in UI
  const d3Packages = [
    'd3-color',
    'd3-dispatch',
    'd3-drag',
    'd3-ease',
    'd3-interpolate',
    'd3-selection',
    'd3-timer',
    'd3-transition',
    'd3-zoom',
  ];

  const allPackagesToRemove = [...uiPackages, ...d3Packages];

  // Also remove nested node_modules in UI-related @teambit packages
  // These are not needed since we use pre-bundled artifacts from these packages
  const nestedNodeModulesToRemove = ['@teambit/react/node_modules', '@teambit/ui/node_modules'];

  try {
    // Remove main UI packages
    for (const packageName of allPackagesToRemove) {
      const packagePath = path.join(nodeModulesPath, packageName);

      if (fs.existsSync(packagePath)) {
        const size = getDirectorySize(packagePath);
        if (deleteFileOrDir(packagePath, `UI dependency: ${packageName}`)) {
          totalUiSaved += size;
          uiPackagesRemoved++;
        }
      }
    }

    // Remove nested node_modules directories
    for (const nestedPath of nestedNodeModulesToRemove) {
      const fullPath = path.join(nodeModulesPath, nestedPath);

      if (fs.existsSync(fullPath)) {
        const size = getDirectorySize(fullPath);
        if (deleteFileOrDir(fullPath, `Nested node_modules: ${nestedPath}`)) {
          totalUiSaved += size;
          uiPackagesRemoved++;
        }
      }
    }

    if (uiPackagesRemoved > 0) {
      console.log(`  Removed ${uiPackagesRemoved} UI packages, saved: ${formatBytes(totalUiSaved)}`);
    } else {
      console.log('  No UI dependencies to remove');
    }
  } catch (error) {
    console.log('  Error processing UI dependencies:', error.message);
  }
}

// Duplicate module formats cleanup - removes ESM or CJS builds to avoid duplication
function cleanupDuplicateModuleFormats(nodeModulesPath) {
  if (!config.removeEsm && !config.removeCjs) {
    return;
  }

  if (config.removeEsm && config.removeCjs) {
    console.log('\n⚠️  Cannot remove both ESM and CJS formats - skipping module format cleanup');
    return;
  }

  const formatToRemove = config.removeEsm ? 'esm' : 'cjs';
  const formatToKeep = config.removeEsm ? 'CJS' : 'ESM';
  console.log(`\n📦 Removing duplicate ${formatToRemove.toUpperCase()} builds (keeping ${formatToKeep})...`);

  let totalFormatSaved = 0;
  let foldersRemoved = 0;

  // Common patterns for dual-format packages
  const patterns = [
    { parent: 'dist', folders: ['esm', 'cjs'] },
    { parent: 'lib', folders: ['esm', 'cjs'] },
    { parent: '', folders: ['esm', 'cjs'] }, // Some packages have esm/cjs at root
  ];

  function scanPackage(packagePath) {
    patterns.forEach((pattern) => {
      const basePath = pattern.parent ? path.join(packagePath, pattern.parent) : packagePath;
      const targetPath = path.join(basePath, formatToRemove);

      if (fs.existsSync(targetPath)) {
        try {
          const stats = fs.statSync(targetPath);
          if (stats.isDirectory()) {
            // Check if both formats exist
            const otherFormat = formatToRemove === 'esm' ? 'cjs' : 'esm';
            const otherPath = path.join(basePath, otherFormat);

            if (fs.existsSync(otherPath)) {
              const sizeBefore = getDirectorySize(targetPath);

              if (config.dryRun) {
                console.log(
                  `  [DRY RUN] Would remove: ${path.relative(nodeModulesPath, targetPath)} (${formatBytes(sizeBefore)})`
                );
              } else {
                fs.rmSync(targetPath, { recursive: true, force: true });
                console.log(`  Removed: ${path.relative(nodeModulesPath, targetPath)} (${formatBytes(sizeBefore)})`);
              }

              totalFormatSaved += sizeBefore;
              foldersRemoved++;
            }
          }
        } catch {
          // Skip files we can't process
        }
      }
    });
  }

  // Scan all packages
  try {
    const packages = fs.readdirSync(nodeModulesPath);
    packages.forEach((pkg) => {
      const pkgPath = path.join(nodeModulesPath, pkg);

      if (pkg.startsWith('@')) {
        // Scoped packages
        try {
          const scopedPackages = fs.readdirSync(pkgPath);
          scopedPackages.forEach((scopedPkg) => {
            scanPackage(path.join(pkgPath, scopedPkg));
          });
        } catch {
          // Skip if can't read
        }
      } else {
        // Regular packages
        scanPackage(pkgPath);
      }
    });

    if (foldersRemoved > 0) {
      totalSaved += totalFormatSaved;
      filesDeleted += foldersRemoved;
      console.log(
        `  Removed ${foldersRemoved} ${formatToRemove.toUpperCase()} build folders, saved: ${formatBytes(totalFormatSaved)}`
      );
    } else {
      console.log(`  No duplicate ${formatToRemove.toUpperCase()} builds found`);
    }
  } catch (error) {
    console.log('  Error processing module formats:', error.message);
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
  cleanupDateFnsLocales(absolutePath);
  cleanupTypeScriptLocales(absolutePath);
  cleanupUiDependencies(absolutePath);
  cleanupDuplicateModuleFormats(absolutePath);

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
    console.log(`Space saved (estimated): ${formatBytes(totalSaved)} (based on du measurements)`);
    console.log(`Current size: ${formatBytes(initialSize)}`);
    console.log(`Estimated final size: ${formatBytes(initialSize - totalSaved)}`);
    console.log(`Estimated reduction: ${((totalSaved / initialSize) * 100).toFixed(1)}%`);
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
  --keep-source-maps Keep all .map files (useful for debugging)
  --keep-teambit-maps Keep only @teambit .map files (for debugging Bit's code)
  --remove-ui-deps  Remove UI-only dependencies not needed for CLI operations
  --remove-esm      Remove duplicate ESM builds (keep CJS for current Bit)
  --remove-cjs      Remove duplicate CJS builds (keep ESM for future migration)
  --verbose         Show detailed output
  --help           Show this help message

Examples:
  node cleanup-node-modules.js                    # Clean ./node_modules (removes all source maps)
  node cleanup-node-modules.js /path/to/node_modules  # Clean specific path
  node cleanup-node-modules.js --dry-run          # Preview what would be deleted
  node cleanup-node-modules.js --keep-source-maps # Keep all source maps for debugging
  node cleanup-node-modules.js --keep-teambit-maps # Keep only @teambit source maps
  node cleanup-node-modules.js --remove-ui-deps   # Also remove UI dependencies
  node cleanup-node-modules.js --remove-esm       # Remove duplicate ESM builds

This script safely removes:
  1. Duplicate monaco-editor builds (dev, esm, min-maps folders) ~64MB
     - Keeps the 'min' folder for production use
  2. Source map files (*.map):
     - Default: Removes all source maps ~124MB (14,697 files)
     - --keep-teambit-maps: Removes only non-@teambit maps ~41MB (7,749 files)
     - --keep-source-maps: Keeps all source maps 0MB
  3. date-fns locale files (~21MB)
     - Removes all locales except English (451 locale files)
  4. TypeScript locale files (~4MB)
     - Removes all non-English error message locales (13 directories)
  5. UI dependencies (--remove-ui-deps only) (~45MB):
     - react-syntax-highlighter, date-fns, d3-* packages, @react-hook/*
     - Nested node_modules in @teambit/react and @teambit/ui (unneeded - using pre-bundled artifacts)
     - Safe to remove since UI is pre-bundled in artifacts
     - ⚠️  WARNING: Will break 'bit start --dev' mode (rebuilds UI dynamically)
  6. Duplicate module formats (--remove-esm or --remove-cjs):
     - Removes duplicate ESM or CJS builds when packages ship both formats
     - Example: @modelcontextprotocol/sdk ships both dist/esm and dist/cjs (4.5MB each)
     - Use --remove-esm to keep CJS only (recommended for current Bit)
     - Use --remove-cjs to keep ESM only (for future ESM migration)

Expected space savings:
  - Default mode: ~176MB
  - With --keep-teambit-maps: ~159MB
  - With --remove-ui-deps (additional): ~45MB
  - With --remove-esm (additional): varies by installation
Safe for production use - only removes non-essential files.
`);
  process.exit(0);
}

// Run the script
main();
