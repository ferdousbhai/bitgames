import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { originalIds } from './catalogue.mjs';

const ids = [...new Set(process.argv.slice(2))];
if (!ids.length || ids.some(id => !originalIds.includes(id))) {
  throw new Error('Pass one or more curated original game IDs.');
}
const additionalBuilders = {
  'dragon-glide': ['nest_blanket.py'],
  'memory-match': ['mat_texture.py'],
  'paint-splash': ['colour_kit.py', 'tablecloth.py'],
};
// Validate the entire plan before rebuilding any game.
const builders = ids.flatMap(id => (id === 'crash-racers'
  ? ['cars.py', 'props.py']
  : ['models.py', ...(additionalBuilders[id] || [])])
  .map(name => fileURLToPath(new URL(`../${id}/blender/${name}`, import.meta.url))));
for (const builder of builders) {
  if (!existsSync(builder)) throw new Error(`Missing Blender builder: ${builder}`);
}
for (const builder of builders) {
  execFileSync('blender', ['--background', '--threads', '8', '--python-exit-code', '1', '--python', builder], { stdio: 'inherit' });
}
