const fs = require('fs');
const path = require('path');

/**
 * Find all instances of packages with a given name in node_modules
 * Handles both regular packages and scoped packages (@scope/package)
 * @param {string} nodeModulesPath - Path to node_modules directory
 * @param {string} packageName - Name of package to find (e.g., 'typescript')
 * @param {number} maxDepth - Maximum recursion depth (default: 10)
 * @returns {Array} Array of package paths
 */
function findPackageInstances(nodeModulesPath, packageName, maxDepth = 10) {
  const instances = [];

  function scanDirectory(dir, depth = 0) {
    if (depth > maxDepth) return;

    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          // Handle scoped packages (e.g., @teambit, @types)
          if (item.startsWith('@') && depth === 0) {
            // This is a scope directory, recurse into it to find packages
            scanDirectory(itemPath, depth);
            continue;
          }

          // Check if this is the package we're looking for
          const packageJsonPath = path.join(itemPath, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            try {
              const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
              if (packageJson.name === packageName) {
                instances.push(itemPath);
              }
            } catch {
              // Ignore packages with invalid package.json
            }

            // Check for nested node_modules
            const nestedModulesPath = path.join(itemPath, 'node_modules');
            if (fs.existsSync(nestedModulesPath) && item !== 'node_modules') {
              scanDirectory(nestedModulesPath, depth + 1);
            }
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  scanDirectory(nodeModulesPath);
  return instances;
}

/**
 * Calculate directory size by summing all file sizes
 * @param {string} dir - Directory path
 * @returns {number} Total size in bytes
 */
function getDirectorySize(dir) {
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

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  findPackageInstances,
  getDirectorySize,
  formatBytes,
};
