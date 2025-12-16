#!/usr/bin/env ts-node
/**
 * Route consistency checker for CI.
 * 
 * This script scans the codebase for hardcoded routes that should use
 * the centralized route builders from src/lib/routes.ts.
 * 
 * Run with: npx ts-node --project tsconfig.server.json scripts/check-routes.ts
 * 
 * Exit codes:
 *   0 - All routes use centralized builders
 *   1 - Found hardcoded routes that should be migrated
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Configuration
// =============================================================================

const SRC_DIR = path.join(__dirname, '..', 'src');

// Patterns that indicate hardcoded routes (should use route builders instead)
const HARDCODED_PATTERNS = [
  // Hardcoded edit routes
  { pattern: /['"`]\/edit\/\$\{/, description: 'Template literal edit route' },
  { pattern: /['"`]\/edit['"`](?!\s*[;,)\]}])/, description: 'Hardcoded /edit string (not at end of statement)' },
  
  // Hardcoded public routes
  { pattern: /['"`]\/p\/\$\{/, description: 'Template literal public route' },
  { pattern: /['"`]\/u\/\$\{/, description: 'Template literal user route' },
  
  // Hardcoded auth routes
  { pattern: /['"`]\/auth\/google['"`]/, description: 'Hardcoded auth route' },
  
  // Hardcoded API routes (excluding server-side handlers)
  { pattern: /fetch\s*\(\s*['"`]\/api\//, description: 'Hardcoded fetch to API' },
];

// Files that are allowed to have "hardcoded" routes (they define them)
const ALLOWED_FILES = [
  'src/lib/routes.ts',
  'src/lib/routes.test.ts',
  'src/lib/api/client.ts',
  'scripts/check-routes.ts',
  // Server-side route handlers define their routes
  'src/server/index.ts',
  'src/server/auth/routes.ts',
  'src/server/auth/passport.ts',
  'src/server/api/index.ts',
  'src/server/upload.ts',
  'src/server/graphql/index.ts',
  // Next.js config
  'next.config.js',
];

// Extensions to check
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// =============================================================================
// Scanner
// =============================================================================

interface Violation {
  file: string;
  line: number;
  pattern: string;
  content: string;
}

function isAllowedFile(filePath: string): boolean {
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  return ALLOWED_FILES.some(allowed => 
    relativePath === allowed || relativePath.replace(/\\/g, '/') === allowed
  );
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  
  if (isAllowedFile(filePath)) {
    return violations;
  }
  
  const ext = path.extname(filePath);
  if (!EXTENSIONS.includes(ext)) {
    return violations;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return;
    }
    
    // Skip import statements (they might import from routes.ts)
    if (trimmed.startsWith('import ')) {
      return;
    }
    
    for (const { pattern, description } of HARDCODED_PATTERNS) {
      if (pattern.test(line)) {
        // Additional check: skip if line contains 'routes.' or 'ROUTES.' or 'api.' or 'auth.'
        if (/\b(routes|ROUTES|api|auth)\.\w+\(/.test(line)) {
          continue;
        }
        
        violations.push({
          file: path.relative(path.join(__dirname, '..'), filePath),
          line: index + 1,
          pattern: description,
          content: line.trim().slice(0, 80),
        });
      }
    }
  });
  
  return violations;
}

function scanDirectory(dir: string): Violation[] {
  const violations: Violation[] = [];
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      violations.push(...scanDirectory(fullPath));
    } else if (entry.isFile()) {
      violations.push(...scanFile(fullPath));
    }
  }
  
  return violations;
}

// =============================================================================
// Main
// =============================================================================

console.log('🔍 Checking for hardcoded routes...\n');

const violations = scanDirectory(SRC_DIR);

if (violations.length === 0) {
  console.log('✅ No hardcoded routes found. All routes use centralized builders.\n');
  process.exit(0);
} else {
  console.log(`❌ Found ${violations.length} potential hardcoded route(s):\n`);
  
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}`);
    console.log(`    Pattern: ${v.pattern}`);
    console.log(`    Content: ${v.content}`);
    console.log();
  }
  
  console.log('Please use route builders from src/lib/routes.ts instead.');
  console.log('If this is a false positive, add the file to ALLOWED_FILES in scripts/check-routes.ts.\n');
  
  process.exit(1);
}

