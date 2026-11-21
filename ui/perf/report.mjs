// Re-render the markdown summary of a results file: node perf/report.mjs <results.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { writeSummary } from './lib/report.mjs';
const f = process.argv[2];
if (!f) { console.error('usage: node perf/report.mjs <results.json>'); process.exit(2); }
const res = JSON.parse(readFileSync(f, 'utf8'));
if (res.noise && res.noise.medianSpreadMs != null) { res.noise.medianSpread = res.noise.medianSpreadMs; res.noise.p90Spread = res.noise.p90SpreadMs; delete res.noise.medianSpreadMs; delete res.noise.p90SpreadMs; writeFileSync(f, JSON.stringify(res, null, 1)); }
writeFileSync(f.replace(/\.json$/, '.md'), writeSummary(res));
console.log('wrote', f.replace(/\.json$/, '.md'));
