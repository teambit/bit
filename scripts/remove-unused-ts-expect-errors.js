#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Script to automatically remove unused @ts-expect-error comments based on TypeScript compiler output
 *
 * This script helps clean up TypeScript codebases by automatically removing @ts-expect-error
 * directives that are no longer needed (when the underlying TypeScript errors have been fixed).
 *
 * USAGE:
 *   node scripts/remove-unused-ts-expect-errors.js
 *
 *   OR add to package.json scripts:
 *   "scripts": {
 *     "clean-ts-expect-errors": "node scripts/remove-unused-ts-expect-errors.js"
 *   }
 *   Then run: npm run clean-ts-expect-errors
 *
 * HOW IT WORKS:
 *   1. Runs TypeScript compiler with --noEmit to get all errors
 *   2. Parses the output to find "Unused '@ts-expect-error' directive" errors
 *   3. Automatically removes those unused directives from the source files
 *   4. Handles both standalone comment lines and inline comments
 *   5. Verifies the fixes by running TypeScript again
 *
 * SAFETY:
 *   - Only removes lines that contain @ts-expect-error comments
 *   - Processes files in order to avoid line number conflicts
 *   - Provides detailed logging of what was changed
 *   - Verifies fixes by re-running TypeScript
 *
 * WHEN TO USE:
 *   - After fixing TypeScript errors and wanting to clean up old @ts-expect-error comments
 *   - During code refactoring when type issues have been resolved
 *   - As part of code quality maintenance
 *
 * REQUIREMENTS:
 *   - Must be run from the project root directory
 *   - TypeScript must be installed in node_modules
 *   - Valid tsconfig.json must exist
 */

console.log('🔍 Finding unused @ts-expect-error directives...');

// Get TypeScript errors
let tscOutput;
try {
  execSync('./node_modules/.bin/tsc --noEmit', { cwd: path.dirname(__dirname), stdio: 'pipe' });
  console.log('✅ No TypeScript errors found! Nothing to clean up.');
  process.exit(0);
} catch (error) {
  tscOutput = error.stdout.toString();
}

// Parse the TypeScript output to find unused @ts-expect-error directives
const unusedDirectives = [];
const lines = tscOutput.split('\n');

for (const line of lines) {
  const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS2578: Unused '@ts-expect-error' directive\.$/);
  if (match) {
    const [, filePath, lineNum, columnNum] = match;
    unusedDirectives.push({
      filePath: path.resolve(path.dirname(__dirname), filePath),
      lineNumber: parseInt(lineNum, 10),
      column: parseInt(columnNum, 10),
    });
  }
}

console.log(`📋 Found ${unusedDirectives.length} unused @ts-expect-error directives`);

if (unusedDirectives.length === 0) {
  console.log('✅ No unused @ts-expect-error directives found!');
  process.exit(0);
}

// Group by file to process efficiently
const fileGroups = {};
for (const directive of unusedDirectives) {
  if (!fileGroups[directive.filePath]) {
    fileGroups[directive.filePath] = [];
  }
  fileGroups[directive.filePath].push(directive);
}

let totalFixed = 0;

// Process each file
for (const [filePath, directives] of Object.entries(fileGroups)) {
  try {
    console.log(
      `🔧 Processing ${path.relative(path.dirname(__dirname), filePath)} - ${directives.length} directive(s)`
    );

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n'); // Sort directives by line number in descending order to avoid line number shifts
    directives.sort((a, b) => b.lineNumber - a.lineNumber);

    for (const directive of directives) {
      const lineIndex = directive.lineNumber - 1; // Convert to 0-based index

      if (lineIndex < 0 || lineIndex >= lines.length) {
        console.warn(`    ⚠️  Warning: Line ${directive.lineNumber} not found in file`);
        continue;
      }

      const line = lines[lineIndex];

      // Check if this line contains @ts-expect-error
      if (line.includes('@ts-expect-error')) {
        // Remove lines that only contain @ts-expect-error comment (and whitespace)
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') && trimmedLine.includes('@ts-expect-error')) {
          // This is a standalone comment line - remove it entirely
          lines.splice(lineIndex, 1);
          totalFixed++;
          console.log(`    ✅ Removed line ${directive.lineNumber}: ${line.trim()}`);
        } else {
          // This might be an inline comment - try to remove just the comment part
          const commentMatch = line.match(/^(.+?)\/\/\s*@ts-expect-error.*$/);
          if (commentMatch) {
            lines[lineIndex] = commentMatch[1].trimRight();
            totalFixed++;
            console.log(`    ✅ Removed inline comment from line ${directive.lineNumber}`);
          } else {
            console.warn(`    ⚠️  Warning: Could not process line ${directive.lineNumber}: ${line.trim()}`);
          }
        }
      } else {
        console.warn(`    ⚠️  Warning: @ts-expect-error not found on line ${directive.lineNumber}: ${line.trim()}`);
      }
    }

    // Write the modified content back to the file
    const newContent = lines.join('\n');
    fs.writeFileSync(filePath, newContent, 'utf8');
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

console.log(`\n🎉 Fixed ${totalFixed} unused @ts-expect-error directives`);

// Run TypeScript again to verify
console.log('\n🔍 Verifying fixes...');
try {
  execSync('./node_modules/.bin/tsc --noEmit', { cwd: path.dirname(__dirname), stdio: 'pipe' });
  console.log('✅ All unused @ts-expect-error directives have been fixed!');
} catch (error) {
  const remainingErrors = error.stdout.toString();
  const remainingUnused = (remainingErrors.match(/Unused '@ts-expect-error' directive/g) || []).length;

  if (remainingUnused > 0) {
    console.log(`⚠️  ${remainingUnused} unused @ts-expect-error directives still remain`);
    console.log('💡 You may need to run the script again or fix them manually');
  } else {
    console.log('✅ No more unused @ts-expect-error directives found!');
    if (remainingErrors.trim()) {
      console.log('📝 Note: There are other TypeScript errors, but no unused @ts-expect-error directives');
    }
  }
}
