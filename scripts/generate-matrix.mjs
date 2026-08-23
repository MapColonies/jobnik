import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Every deployed application declares which Dockerfile builds it via its own
// package.json's `dockerfile` field (see apps/jobnik-manager/package.json).
// Reading that dynamically, instead of hardcoding a service list here, is
// what lets a second deployable app join the build matrix with no change to
// this script or to the pipeline that consumes it.
const output = execSync('pnpm exec turbo ls --output=json --filter="./apps/*"').toString();
const { packages } = JSON.parse(output);

const matrix = packages.items
  .map((pkg) => {
    const pkgJsonPath = path.join(pkg.path, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

    return {
      // The image name comes from the package name, not the repository name,
      // so it resolves correctly even though the repository is now named for
      // the product rather than for this one service.
      service: pkg.name,
      dockerfile: pkgJson.dockerfile,
      version: pkgJson.version,
    };
  })
  // Skip any app that hasn't declared how it's built.
  .filter((item) => item.dockerfile);

console.log(JSON.stringify(matrix));
