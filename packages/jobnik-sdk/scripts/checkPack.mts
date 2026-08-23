import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// publint and attw validate packaging shape and type resolution, but neither one asserts
// this package's own invariants: that what actually ships is self-contained (build output
// plus the specification it parses at runtime) and free of any dependency on jobnik-openapi,
// which is private and never published (ticket 04). A dry-run pack is the one place both are
// checked against what would really be published, not against source layout.
const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const [{ files }] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })) as [{ files: { path: string }[] }];
const packedPaths = new Set(files.map((file) => file.path));

const requiredPaths = ['dist/index.js', 'dist/index.d.ts', 'dist/openapi3.yaml'];
const missingPaths = requiredPaths.filter((path) => !packedPaths.has(path));
if (missingPaths.length > 0) {
  throw new Error(`Dry-run pack is missing expected file(s): ${missingPaths.join(', ')}`);
}

const installedDependencies = { ...packageJson.dependencies, ...packageJson.peerDependencies };
if ('jobnik-openapi' in installedDependencies) {
  throw new Error('jobnik-openapi must stay a devDependency: it is private and was never published.');
}
