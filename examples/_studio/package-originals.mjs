// Copy the maintained learning helpers into the original games without changing their game code,
// then refresh every original's shipment manifest.
import {copyFileSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename,join} from 'node:path';
import {createHash} from 'node:crypto';
import {originalIds} from './catalogue.mjs';

const studio=fileURLToPath(new URL('.',import.meta.url));
const examples=join(studio,'..');

const adventure=['js/adventure.js','adventure.css'];
const studioDialog=['js/studio-dialog.js','studio-dialog.css'];
const helpers={
  'balloon-pop':adventure,
  'bumper-ducks':adventure,
  'bunny-hop':adventure,
  'cake-stack':[...adventure,...studioDialog,'js/recipe-studio.js'],
  'crash-racers':[...adventure,'js/delivery.js'],
  'dragon-glide':adventure,
  'fish-pond':adventure,
  'star-catcher':adventure,
  'paint-splash':['js/gallery.js','gallery.css',...studioDialog,'js/colour-studio.js','js/colour-model.js'],
  'penguin-bowling':['js/prediction.js','prediction.css'],
};

const unhashed=new Set(['bitgames.json','_headers','_redirects']);

function listFiles(dir,prefix=''){
  return readdirSync(dir,{withFileTypes:true})
    .filter(entry=>!entry.name.startsWith('.'))
    .flatMap(entry=>{
      if(entry.isDirectory())return listFiles(join(dir,entry.name),`${prefix}${entry.name}/`);
      return unhashed.has(entry.name)?[]:[prefix+entry.name];
    });
}

/** Write public/bitgames.json: the SHA-256 of every shipped file, sorted by path. */
function writeShipmentManifest(publicDir){
  const files={};
  for(const file of listFiles(publicDir).sort()){
    files[file]=createHash('sha256').update(readFileSync(join(publicDir,file))).digest('hex');
  }
  writeFileSync(join(publicDir,'bitgames.json'),JSON.stringify({files},null,2)+'\n');
}

for(const id of originalIds){
  // Every game speaks through the shared queued voice.
  const files=['js/speech.js',...(helpers[id] || [])];
  for(const file of files)copyFileSync(join(studio,'originals',basename(file)),join(examples,id,'public',file));
}
for(const id of originalIds)writeShipmentManifest(join(examples,id,'public'));
