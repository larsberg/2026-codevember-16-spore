import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createSetupHandler } from '../server/setup-api.js';
import { defaultSetup } from '../src/settings.js';

test('atomic GET/PUT round trip uses Spore ownership and retains the complete studio setup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'spore-setup-')),file=join(dir,'settings.json'),handler=createSetupHandler(file);
 async function request(method,body,id='16-spore') {
  const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method,url:'/api/setup',headers:{host:'127.0.0.1:1234','content-type':'application/json','x-sketch-id':id}});
  let output; const headers={};const res={setHeader(k,v){headers[k]=v;},end(v){output=JSON.parse(v);}};
  await handler(req,res,()=>assert.fail('unexpected route'));return {body:output,status:res.statusCode,headers};
 }
 try {
  const setup=defaultSetup();setup.physics.gravity=6;setup.camera.yaw=67;setup.bloom.enabled=true;setup.focus.enabled=true;
  setup.materials.panels.roughness=.13;setup.audio.enabled=false;Object.assign(setup.audio,{instrument:'bottle',chord:'hollow',breath:.24,buzz:.37,vowel:.91,flutter:.6,breathRate:23,bend:4});setup.lighting.environment.intensity=1.8;
  Object.assign(setup.lighting.spotlight,{penumbra:.9,softness:7.5,intensity:11200});
  assert.equal((await request('PUT',setup,'01-fold')).status,409);
  assert.equal((await request('PUT',{...setup,generation:{seed:184847}})).status,200);
  const saved=await request('GET');assert.equal(saved.headers['X-Sketch-Id'],'16-spore');assert.deepEqual(saved.body,setup);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),setup);
  assert.equal((await request('PUT',{...setup,physics:{gravity:-1}})).status,400);
  assert.deepEqual((await request('GET')).body,setup);
 }finally{await rm(dir,{recursive:true,force:true});}
});
