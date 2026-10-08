import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { originalIds } from './catalogue.mjs';
const ids = process.argv.slice(2);
if (!ids.length || ids.some(id => !originalIds.includes(id))) throw new Error('Pass one or more curated original game IDs.');
for (const id of ids) execFileSync('blender', ['--background', '--threads', '8', '--python-exit-code', '1', '--python', fileURLToPath(new URL(`../${id}/blender/models.py`, import.meta.url))], { stdio: 'inherit' });
