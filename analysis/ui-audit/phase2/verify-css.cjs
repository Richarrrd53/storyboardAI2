// Syntax/ownership check only. This never claims browser/computed-style validation.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const postcss = require('postcss'); // Already present in this workspace; no installation.
const root = path.resolve(__dirname, '../../..');
const files = execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(file => file.endsWith('.css'));
const results = files.map(file => {
  try { const tree = postcss.parse(fs.readFileSync(path.join(root, file), 'utf8'), { from: file }); return { file, parsed: true, nodes: tree.nodes.length }; }
  catch (error) { return { file, parsed: false, error: error.message }; }
});
fs.writeFileSync(path.join(__dirname, 'css-validation.json'), JSON.stringify({ parser: 'existing postcss', results, note: 'Syntax only; browser rendering remains Pending Verification.' }, null, 2));
if (results.some(result => !result.parsed)) process.exitCode = 1;
console.log(`${results.filter(result => result.parsed).length}/${results.length} changed stylesheets parsed`);
