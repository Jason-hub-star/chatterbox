#!/usr/bin/env node
// Verifies the schema split remains a lossless, navigable replacement for the legacy source.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const schemaDir = join(root, 'docs/schema');
const manifestPath = join(schemaDir, 'manifest.json');
const hubPath = join(root, 'docs/DATA-SCHEMA.md');
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL ${message}`);
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}

function sectionModule(target, modules) {
  if (/^\d/.test(target)) {
    const heading = new RegExp(`^#{2,3} ${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\.|\\s|$|[~-])`, 'm');
    return modules.find(({ text }) => heading.test(text));
  }
  if (target.toUpperCase() === 'PENDING') return modules.find(({ text }) => text.includes('## PENDING'));

  const [table, field] = target.split('.', 2);
  return modules.find(({ text }) => {
    const tableHeading = new RegExp(`^#{2,3} .*\\b${table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'im');
    return tableHeading.test(text) && (!field || text.includes(field));
  });
}

if (!existsSync(manifestPath)) {
  fail('missing docs/schema/manifest.json');
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const modulePaths = manifest.modules.map((file) => join(schemaDir, file));
  const missingModules = modulePaths.filter((file) => !existsSync(file));
  for (const file of missingModules) fail(`missing schema module: ${relative(root, file)}`);

  const snapshotPath = join(root, manifest.legacySnapshot);
  if (!existsSync(snapshotPath)) {
    fail(`missing legacy snapshot: ${manifest.legacySnapshot}`);
  } else if (missingModules.length === 0) {
    const snapshot = readFileSync(snapshotPath, 'utf8');
    const combined = modulePaths.map((file) => readFileSync(file, 'utf8')).join('');
    if (combined !== snapshot) fail('schema modules do not reconstruct the legacy snapshot byte-for-byte');
    const hash = createHash('sha256').update(snapshot).digest('hex');
    if (hash !== manifest.sourceSha256) fail('legacy snapshot hash differs from manifest.sourceSha256');

    const modules = modulePaths.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
    let checkedReferences = 0;
    const referencePattern = /DATA-SCHEMA(?:\.md)?\s*§\s*([0-9]+(?:\.[0-9]+)*(?:[a-z])?|[A-Za-z_][A-Za-z0-9_.-]*)/g;
    for (const file of walk(root)) {
      if (file === snapshotPath || modulePaths.includes(file)) continue;
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const match of text.matchAll(referencePattern)) {
        checkedReferences += 1;
        if (!sectionModule(match[1], modules)) {
          fail(`${relative(root, file)} references missing schema target §${match[1]}`);
        }
      }
    }
    console.log(`schema references checked: ${checkedReferences}`);
  }

  if (!existsSync(hubPath)) {
    fail('missing docs/DATA-SCHEMA.md compatibility hub');
  } else {
    const hub = readFileSync(hubPath, 'utf8');
    for (const file of manifest.modules.slice(1)) {
      if (!hub.includes(`schema/${file}`)) fail(`hub does not route to schema/${file}`);
    }
  }
}

console.log(failures === 0 ? 'schema split OK (lossless + routable)' : `schema split failed (${failures})`);
process.exit(failures ? 1 : 0);
