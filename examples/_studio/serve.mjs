// Local preview of every example: the catalogue at /, each game at /<id>/, Three.js at /vendor/three/.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const three=fileURLToPath(new URL('../../apps/store/node_modules/three/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const vendorUrls=['https://bitgames.store/vendor/three/','https://bitgames-store.ferdousbd.workers.dev/vendor/three/'];

// Map a request path to a file, or throw if it escapes its root.
async function resolveFile(pathname){
  let base=root;
  let url=pathname;
  if(url.startsWith('/vendor/three/')){
    base=three;
    url=url.slice('/vendor/three'.length);
  }else if(url==='/'){
    url='/catalogue/index.html';
  }else if(/^\/[a-z0-9-]+(?:\/|$)/.test(url)&&!url.startsWith('/catalogue/')){
    // /<id>/<file> and /<id>/public/<file> both serve examples/<id>/public/<file>.
    const [,id,...parts]=url.split('/');
    if(parts[0]==='public')parts.shift();
    url=`/${id}/public/${parts.join('/')}`;
  }
  let path=resolve(base,'.'+url);
  if(path!==resolve(base)&&!path.startsWith(resolve(base)+sep))throw new Error('outside root');
  if((await stat(path)).isDirectory())path=resolve(path,'index.html');
  return path;
}

const server=createServer(async(req,res)=>{
  try{
    const path=await resolveFile(decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    let bytes=await readFile(path);
    if(extname(path)==='.html'){
      // Serve the store's Three.js locally instead of from the live store.
      let html=bytes.toString();
      for(const vendor of vendorUrls)html=html.replaceAll(vendor,'/vendor/three/');
      bytes=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(bytes);
  }catch{
    res.writeHead(404,{'Content-Type':'text/plain'});
    res.end('Not found');
  }
});

const port=Number(process.env.EXAMPLES_PORT||4173);
server.listen(port,'127.0.0.1',()=>console.log(`100-game catalogue: http://localhost:${port}`));
