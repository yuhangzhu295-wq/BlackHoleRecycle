import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();

const objectArtRegistryPath = path.join(projectRoot, 'cocos', 'assets', 'scripts', 'world', 'ObjectArtRegistry.ts');
const worldArtLibraryPath = path.join(projectRoot, 'cocos', 'assets', 'scripts', 'world', 'WorldArtLibrary.ts');

const runtimeFilesToCheck = [
  path.join(projectRoot, 'cocos', 'assets', 'scripts', 'gameplay', 'CompressibleObject.ts'),
  path.join(projectRoot, 'cocos', 'assets', 'scripts', 'world', 'InfiniteWorldManager.ts'),
  path.join(projectRoot, 'cocos', 'assets', 'scripts', 'world', 'WorldCellFactory.ts'),
  path.join(projectRoot, 'cocos', 'assets', 'scripts', 'gameplay', 'GameManager.ts'),
  path.join(projectRoot, 'cocos', 'assets', 'scripts', 'world', 'ObjectArtRegistry.ts'),
];

console.log('[object-art-coverage] Starting validation...');

let pass = true;
const errors = [];

// 1. Read WorldArtLibrary.ts to extract WorldArtKind enum values and switch cases
const worldArtLibraryContent = fs.readFileSync(worldArtLibraryPath, 'utf-8');

// Extract WorldArtKind union types
const kindTypeMatch = worldArtLibraryContent.match(/export type WorldArtKind =\r?\n([\s\S]*?);/);
const worldArtKinds = new Set();
if (kindTypeMatch) {
  const kindsStr = kindTypeMatch[1];
  const kinds = kindsStr.split('|').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
  kinds.forEach(k => worldArtKinds.add(k));
} else {
  pass = false;
  errors.push('Could not parse WorldArtKind type union from WorldArtLibrary.ts');
}

// Extract switch cases in getTemplateOrNull
const switchCases = new Set();
const switchMatches = worldArtLibraryContent.matchAll(/case\s+'([^']+)'/g);
for (const match of switchMatches) {
  switchCases.add(match[1]);
}

// Extract required kinds in validateTemplates
const requiredKinds = new Set();
const requiredMatch = worldArtLibraryContent.match(/required:\s*WorldArtKind\[\]\s*=\s*\[([\s\S]*?)\];/);
if (requiredMatch) {
  const reqStr = requiredMatch[1];
  const reqs = reqStr.split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
  reqs.forEach(r => requiredKinds.add(r));
}

// 2. Read ObjectArtRegistry.ts to extract OBJECT_ART_BINDINGS
const objectArtRegistryContent = fs.readFileSync(objectArtRegistryPath, 'utf-8');

const bindingsMatch = objectArtRegistryContent.match(/const OBJECT_ART_BINDINGS:[\s\S]*?=\s*\{([\s\S]*?)\};/);
const bindings = [];
if (bindingsMatch) {
  const body = bindingsMatch[1];
  const lineMatches = body.matchAll(/([a-zA-Z0-9_]+):\s*\{\s*kind:\s*'([^']+)'/g);
  for (const m of lineMatches) {
    bindings.push({ type: m[1], kind: m[2] });
  }
} else {
  pass = false;
  errors.push('Could not parse OBJECT_ART_BINDINGS from ObjectArtRegistry.ts');
}

// 3. Verify coverage for every binding
const uncoveredBindings = [];
const missingFromSwitch = [];
const missingFromRequired = [];

for (const binding of bindings) {
  if (!worldArtKinds.has(binding.kind)) {
    pass = false;
    uncoveredBindings.push(binding);
    errors.push(`Binding type '${binding.type}' references unknown WorldArtKind '${binding.kind}'`);
  }
  if (!switchCases.has(binding.kind)) {
    pass = false;
    missingFromSwitch.push(binding);
    errors.push(`Kind '${binding.kind}' for type '${binding.type}' is missing from getTemplateOrNull switch in WorldArtLibrary.ts`);
  }
  if (!requiredKinds.has(binding.kind)) {
    pass = false;
    missingFromRequired.push(binding);
    errors.push(`Kind '${binding.kind}' for type '${binding.type}' is missing from validateTemplates required list in WorldArtLibrary.ts`);
  }
}

// 4. Check for primitive fallback violations in runtime files
const primitiveFallbackViolations = [];
const suspiciousPatterns = [
  /utils\.MeshUtils\.create/i,
  /Mesh\.createBox/i,
  /Mesh\.createSphere/i,
  /Mesh\.createCylinder/i,
  /createPrimitive/i,
  /fallbackToPrimitive/i,
  /usePrimitiveIfMissing/i
];

for (const filePath of runtimeFilesToCheck) {
  const relPath = path.relative(projectRoot, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(line)) {
        pass = false;
        const violation = { file: relPath, line: idx + 1, code: line.trim(), pattern: pattern.toString() };
        primitiveFallbackViolations.push(violation);
        errors.push(`Primitive fallback pattern violation at ${relPath}:${idx + 1} -> ${line.trim()}`);
      }
    }
  });
}

// 5. Build artifact evidence
const artifactDir = path.join(projectRoot, 'artifacts', 'qa');
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

const status = pass ? 'PASS' : 'FAIL';
const reportData = {
  timestamp: new Date().toISOString(),
  status,
  metrics: {
    totalObjectBindings: bindings.length,
    totalWorldArtKinds: worldArtKinds.size,
    checkedRuntimeFilesCount: runtimeFilesToCheck.length
  },
  bindings,
  uncoveredBindings,
  missingFromSwitch,
  missingFromRequired,
  primitiveFallbackViolations,
  errors
};

const artifactPath = path.join(artifactDir, 'object-art-coverage.json');
fs.writeFileSync(artifactPath, JSON.stringify(reportData, null, 2), 'utf-8');
console.log(`[object-art-coverage] Evidence written to ${path.relative(projectRoot, artifactPath)}`);

if (pass) {
  console.log('[object-art-coverage] PASS');
  process.exit(0);
} else {
  console.error('[object-art-coverage] FAIL: Object art coverage or primitive fallback checks failed.');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
