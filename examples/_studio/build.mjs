// Package each catalogue design into a standalone game folder, then regenerate the catalogue.
// Importing package-originals.mjs first copies the original games' learning helpers.
import {writeShipmentManifest} from './package-originals.mjs';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {games,themes,instructions} from './catalogue.mjs';

const studio=fileURLToPath(new URL('.',import.meta.url));
const examples=join(studio,'..');
const runtime=join(studio,'runtime');
const json=value=>JSON.stringify(value,null,2)+'\n';
const escapeHtml=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
// The runtime numbers activities in the order instructions lists them.
const activityNames=Object.keys(instructions);
const runtimeScripts=readdirSync(runtime).filter(file=>file.endsWith('.js'));
const indexTemplate=readFileSync(join(runtime,'index.html'),'utf8');
const animalThemes=['forest','garden','pond','arctic','prehistoric'];

function writeGame(g){
  const dir=join(examples,g.id);
  for(const sub of ['public/js','public/models','blender'])mkdirSync(join(dir,sub),{recursive:true});
  const ages=g.ages.join('–');

  const game={...g,instructions:instructions[g.mode],activityNumber:activityNames.indexOf(g.mode)};
  writeFileSync(join(dir,'public/js/game.js'),`// Generated from ../_studio/catalogue.mjs.\nexport default ${JSON.stringify(game,null,2)};\n`);

  const meta={
    id:g.id,
    title:g.title,
    tagline:g.tagline,
    howToPlay:`${instructions[g.mode]} Three gentle difficulty settings. Ages ${ages}. Learning: ${g.skill}.`,
    emoji:g.emoji,
    color:g.accent,
    category:g.theme==='space'?'space':animalThemes.includes(g.theme)?'animals':'puzzle',
    together:false,
    featured:false,
    ages:g.ages,
    learning:g.skill,
  };
  // Preserve a real pinned deployment URL if this example has been published.
  const metadataPath=join(dir,'game.json');
  if(existsSync(metadataPath)){
    const old=JSON.parse(readFileSync(metadataPath));
    if(old.url)meta.url=old.url;
  }
  writeFileSync(metadataPath,json(meta));

  writeFileSync(join(dir,'package.json'),json({
    name:`bitgames-${g.id}`,
    private:true,
    type:'module',
    scripts:{
      build:'node ../_studio/build.mjs',
      assets:'blender --background --python-exit-code 1 --python blender/models.py',
      deploy:'node bitgames.mjs && cf deploy',
    },
    devDependencies:{cf:'1.0.0-beta.12',wrangler:'4.147.0'},
  }));
  writeFileSync(join(dir,'cloudflare.config.ts'),`import { defineConfig } from 'cf/config';\nexport default defineConfig({ worker: { name: 'bitgames-${g.id}', compatibilityDate: '2026-10-05', previewUrls: true, observability: { enabled: true, traces: { enabled: true, headSamplingRate: 0.1 } } } });\n`);
  // Deployment helpers are shared with Memory Match.
  for(const file of ['bitgames.mjs','wrangler.config.ts','.gitignore','public/_headers'])copyFileSync(join(examples,'memory-match',file),join(dir,file));
  writeFileSync(join(dir,'blender/models.py'),`"""Rebuild this adventure with Blender's CLI from any working directory."""\nimport runpy, sys\nfrom pathlib import Path\nsys.argv = ['models.py', '--', '${g.id}']\nrunpy.run_path(str(Path(__file__).resolve().parents[2] / '_studio' / 'blender' / 'build_assets.py'), run_name='__main__')\n`);
  writeFileSync(join(dir,'README.md'),`# ${g.title}\n\n${g.tagline}\n\n- Ages: ${ages}\n- Learning: ${g.skill}\n- Activity: ${g.mode}\n\n${instructions[g.mode]}\n\nPlay locally with \`pnpm examples:serve\`, then select this game at http://localhost:4173. Rebuild graphics with \`pnpm --dir examples/${g.id} assets\`. Shared source and full build instructions: [studio](../_studio/README.md).\n\nEach public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with \`node examples/publish.mjs ${g.id}\` after installing workspace dependencies.\n`);

  for(const file of runtimeScripts)copyFileSync(join(runtime,file),join(dir,'public/js',file));
  copyFileSync(join(runtime,'style.css'),join(dir,'public/style.css'));
  writeFileSync(join(dir,'public/index.html'),indexTemplate.replaceAll('__TITLE__',escapeHtml(g.title)).replaceAll('__ACCENT__',g.accent));
  // A game whose art has not been built with Blender yet has no shipment to describe.
  if(existsSync(join(dir,'public/models/world.glb')))writeShipmentManifest(join(dir,'public'));
}

const designs=games.map((g,index)=>{
  const [sky,ground,accent,scenery]=themes[g.theme];
  // A game can swap its theme's scenery, e.g. so no decor animal is mistaken for a word's animal.
  return {...g,sky:g.sky||sky,ground:g.ground||ground,accent,scenery:g.scenery||scenery,seed:4217+index*73};
});
designs.forEach(writeGame);
// Blender's build_assets.py reads the resolved designs.
writeFileSync(join(studio,'designs.json'),json(designs));

const all=readdirSync(examples)
  .filter(id=>existsSync(join(examples,id,'game.json')))
  .map(id=>JSON.parse(readFileSync(join(examples,id,'game.json'))));
writeFileSync(join(examples,'catalogue/games.json'),json(all));

const rows=all.map(g=>`| [${g.emoji} ${g.title}](./${g.id}/public/index.html) | ${g.ages.join('–')} | ${g.learning} |`);
writeFileSync(join(examples,'CATALOGUE.md'),`# The 100-game catalogue

The original 12 games plus 88 learning adventures. New games are playable locally and ready to deploy; only game.json files with a real pinned URL are seeded into the live store.

| Game | Ages | Learning |
| --- | --- | --- |
${rows.join('\n')}
`);
console.log(`Packaged ${games.length} learning adventures; catalogue contains ${all.length} games.`);
