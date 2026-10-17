// Refresh every original's shipment manifest. The games share no helper code: since the 2026-10-16
// fun pass they have no shared voice, missions or learning studios to copy in.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {originalIds} from './catalogue.mjs';

const examples=fileURLToPath(new URL('..',import.meta.url));

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

for(const id of originalIds)writeShipmentManifest(join(examples,id,'public'));
