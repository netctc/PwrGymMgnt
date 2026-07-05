import fs from 'node:fs';

const files = ['package-lock.json', 'npm-shrinkwrap.json'].filter((file) => fs.existsSync(file));
const blockedPatterns = [
  'packages.applied-caas-gateway',
  'internal.api.openai.org',
  'artifactory/api/npm/npm-public',
];

let failed = false;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of blockedPatterns) {
    if (text.includes(pattern)) {
      console.error(`ERROR: ${file} contains non-public registry host: ${pattern}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('Fix package-lock resolved URLs or regenerate the lockfile with https://registry.npmjs.org/.');
  process.exit(1);
}

console.log('Registry validation passed: lockfile does not contain internal package registry URLs.');
