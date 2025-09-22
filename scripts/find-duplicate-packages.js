#!/usr/bin/env node

/**
 * Find Duplicate Packages Script
 * ===============================
 *
 * This script finds all packages that appear multiple times in node_modules
 * with potentially different versions. This helps identify opportunities for
 * dependency consolidation to reduce node_modules size.
 *
 * Usage: node find-duplicate-packages.js [path-to-node_modules]
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const showOnlyLarge = args.includes('--large-only');
const filteredArgs = args.filter((arg) => !arg.startsWith('--'));
const nodeModulesPath = filteredArgs[0] || './node_modules';
const sizeThreshold = 1024 * 1024; // 1MB threshold for --large-only flag

const absolutePath = path.resolve(nodeModulesPath);

if (!fs.existsSync(absolutePath)) {
  console.error(`❌ Error: node_modules directory not found at ${absolutePath}`);
  process.exit(1);
}

console.log('🔍 Finding Duplicate Packages');
console.log('==============================');
console.log(`📁 Scanning: ${absolutePath}`);
if (showOnlyLarge) {
  console.log(`📊 Showing only packages larger than 1MB\n`);
} else {
  console.log('');
}

// Map to store all package occurrences
const packageMap = new Map();

function getDirectorySize(dir) {
  // Use Node.js fs to calculate actual file sizes (not disk usage)
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

function findPackages(dir, baseDir = dir, depth = 0) {
  // Don't go too deep to avoid infinite recursion
  if (depth > 10) return;

  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        // Handle scoped packages (e.g., @teambit, @types)
        if (item.startsWith('@') && depth === 0) {
          // This is a scope directory, recurse into it to find packages
          findPackages(itemPath, baseDir, depth);
          continue;
        }

        // Check if this is a package (has package.json)
        const packageJsonPath = path.join(itemPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const packageName = packageJson.name;

            if (packageName) {
              const relativePath = path.relative(baseDir, itemPath);
              const version = packageJson.version || 'unknown';
              const size = getDirectorySize(itemPath);

              if (!packageMap.has(packageName)) {
                packageMap.set(packageName, []);
              }

              packageMap.get(packageName).push({
                path: relativePath,
                version: version,
                size: size,
              });
            }
          } catch {
            // Ignore packages with invalid package.json
          }
        }

        // Check for nested node_modules
        const nestedModulesPath = path.join(itemPath, 'node_modules');
        if (fs.existsSync(nestedModulesPath) && item !== 'node_modules') {
          findPackages(nestedModulesPath, baseDir, depth + 1);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}: ${error.message}`);
  }
}

// Start scanning
console.log('Scanning for packages...\n');
findPackages(absolutePath, absolutePath);

// Find duplicates
const duplicates = [];
let totalDuplicateSize = 0;
let totalPotentialSavings = 0;

for (const [packageName, locations] of packageMap.entries()) {
  if (locations.length > 1) {
    // Calculate total size and find unique versions
    const totalSize = locations.reduce((sum, loc) => sum + loc.size, 0);
    const uniqueVersions = [...new Set(locations.map((loc) => loc.version))];
    const largestSize = Math.max(...locations.map((loc) => loc.size));
    const potentialSaving = totalSize - largestSize;

    if (showOnlyLarge && totalSize < sizeThreshold) {
      continue;
    }

    duplicates.push({
      name: packageName,
      count: locations.length,
      uniqueVersions: uniqueVersions.length,
      versions: uniqueVersions,
      totalSize: totalSize,
      potentialSaving: potentialSaving,
      locations: locations.sort((a, b) => b.size - a.size),
    });

    totalDuplicateSize += totalSize;
    totalPotentialSavings += potentialSaving;
  }
}

// Sort by potential savings
duplicates.sort((a, b) => b.potentialSaving - a.potentialSaving);

// Display results
if (duplicates.length === 0) {
  console.log('✅ No duplicate packages found!');
} else {
  console.log(`Found ${duplicates.length} packages with multiple copies:`);
  console.log(`(Sorted by potential savings - highest first)\n`);
  console.log('='.repeat(80));

  // Show top duplicates
  const displayCount = showOnlyLarge ? duplicates.length : Math.min(20, duplicates.length);

  for (let i = 0; i < displayCount; i++) {
    const dup = duplicates[i];
    console.log(`\n📦 ${dup.name}`);
    console.log(
      `   Copies: ${dup.count} | Versions: ${dup.uniqueVersions} | Total Size: ${formatBytes(dup.totalSize)}`
    );
    console.log(`   Potential Saving: ${formatBytes(dup.potentialSaving)}`);

    if (dup.uniqueVersions > 1) {
      console.log(`   Versions found: ${dup.versions.join(', ')}`);
    }

    console.log('   Locations:');
    for (const loc of dup.locations) {
      const marker = loc.path.includes('node_modules/node_modules') ? '  ⚠️ ' : '   - ';
      console.log(`${marker}${loc.path} (v${loc.version}, ${formatBytes(loc.size)})`);
    }
  }

  if (duplicates.length > displayCount) {
    console.log(`\n... and ${duplicates.length - displayCount} more duplicates`);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary');
  console.log('='.repeat(80));
  console.log(`Total duplicate packages: ${duplicates.length}`);
  console.log(`Total space used by duplicates: ${formatBytes(totalDuplicateSize)}`);
  console.log(`Potential space savings: ${formatBytes(totalPotentialSavings)}`);

  // Find packages with highest potential savings
  const topSavings = [...duplicates].sort((a, b) => b.potentialSaving - a.potentialSaving).slice(0, 5);
  console.log('\n💰 Top potential savings:');
  for (const dup of topSavings) {
    console.log(`   - ${dup.name}: ${formatBytes(dup.potentialSaving)} (${dup.count} copies)`);
  }

  // Find packages with most duplicates
  const mostDuplicated = [...duplicates].sort((a, b) => b.count - a.count).slice(0, 5);
  console.log('\n📊 Most frequently duplicated:');
  for (const dup of mostDuplicated) {
    console.log(`   - ${dup.name}: ${dup.count} copies (${formatBytes(dup.potentialSaving)} savings)`);
  }

  // Find packages with most version conflicts
  const mostVersions = [...duplicates]
    .filter((d) => d.uniqueVersions > 1)
    .sort((a, b) => b.uniqueVersions - a.uniqueVersions)
    .slice(0, 5);

  if (mostVersions.length > 0) {
    console.log('\n⚠️  Packages with most version conflicts:');
    for (const dup of mostVersions) {
      console.log(`   - ${dup.name}: ${dup.uniqueVersions} different versions (${dup.versions.join(', ')})`);
    }
  }
}

console.log('\n💡 Tips:');
console.log('   - Use --large-only flag to see only packages larger than 1MB');
console.log('   - Consider using pnpm overrides to consolidate versions');
console.log('   - Check if nested node_modules can be hoisted');
console.log('   - Review version conflicts and update dependencies where possible');
