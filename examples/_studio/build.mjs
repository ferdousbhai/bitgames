// Package the protected originals; the retired generator cannot recreate games.
import './package-originals.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { originalIds } from './catalogue.mjs';
const examples = new URL('../', import.meta.url);
const games = originalIds.map(id => {
  const game = JSON.parse(readFileSync(new URL(`${id}/game.json`, examples)));
  if (game.id !== id) throw new Error(`Mismatched game metadata: ${id}`);
  return game;
});
writeFileSync(new URL('catalogue/games.json', examples), JSON.stringify(games, null, 2) + '\n');
const rows = games.map(g => `| [${g.emoji} ${g.title}](./${g.id}/public/index.html) | ${g.ages.join('–')} | ${g.learning} |`);
writeFileSync(new URL('CATALOGUE.md', examples), `# BitGames catalogue

The twelve original games, preserved after the generated batch was retired. Quality and children's enjoyment guide future additions; there is no catalogue size target.

| Game | Ages | Learning |
| --- | --- | --- |
${rows.join('\n')}
`);
console.log(`Packaged ${games.length} original games; retired games are not generated.`);
