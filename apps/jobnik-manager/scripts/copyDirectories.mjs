#!/usr/bin/env zx

import { $, argv, fs, path } from 'zx';

// Validate command line arguments
function validateArgs() {
  if (argv._.length !== 2) {
    console.error('Error: Please provide source and destination directories.');
    process.exit(1);
  }

  const [source, destination] = argv._;

  // Check if source exists
  if (!fs.existsSync(source)) {
    console.error(`Error: Source directory '${source}' does not exist.`);
    process.exit(1);
  }

  // Check if source is a directory
  if (!fs.statSync(source).isDirectory()) {
    console.error(`Error: '${source}' is not a directory.`);
    process.exit(1);
  }

  return { source, destination };
}

function deepCopyDirectory(source, destination) {
  try {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    fs.copy(source, destination, {
      filter: (src, dest) => {
        if (src.endsWith('.d.ts')) {
          return false;
        }

        return true;
      },
    });
  } catch (error) {
    console.error('Error copying directory:', error);
    process.exit(1);
  }
}

// Main function
function main() {
  const { source, destination } = validateArgs();
  deepCopyDirectory(source, destination);
}

try {
  main();
} catch (err) {
  console.error('Unexpected error:', err);
  process.exit(1);
}
