import fs from 'fs';
import path from 'path';

const benchmarkPath = path.join('server', 'data', 'benchmarkDataset.json');
const defaultDatasetPath = 'mindguard_email_PRODUCTION_v3.json';
const filesDatasetPath = path.join('files', 'mindguard_email_PRODUCTION_v3_2.json');
const sourcePath = fs.existsSync(defaultDatasetPath) ? defaultDatasetPath : filesDatasetPath;

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Could not find email dataset at ${defaultDatasetPath} or ${filesDatasetPath}`);
}

const existing = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
const newData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

if (!Array.isArray(existing.samples)) {
  throw new Error('benchmarkDataset.json is missing a samples array');
}
if (!Array.isArray(newData.samples)) {
  throw new Error(`${sourcePath} is missing a samples array`);
}

const existingIds = new Set(existing.samples.map((s) => s.id));
const toAdd = newData.samples.filter((s) => !existingIds.has(s.id));

existing.samples = [...existing.samples, ...toAdd];
existing._meta = {
  ...(existing._meta || {}),
  total_samples: existing.samples.length,
  last_updated: new Date().toISOString(),
  email_samples_added: toAdd.length
};

fs.writeFileSync(benchmarkPath, JSON.stringify(existing, null, 2));
console.log(`Added ${toAdd.length} email samples. Total: ${existing.samples.length}`);
