import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const artifacts=new URL('./artifacts/',import.meta.url).pathname;
const id='11111111-1111-4111-8111-111111111111';
const error={error:{code:'provider_unavailable',message:'Synthetic unavailable fixture',request_id:id,retryable:false,capability:'answers'}};
const capability={state:'disabled',reason:'not_configured'};
async function fixture(page:Page){await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/capabilities'))return route.fulfill({json:{mode:'disabled',answers:capability,indexing:capability,discovery:capability,google:capability,email:capability,identity:capability}});if(path.endsWith('/institutions'))return route.fulfill({json:{items:[{id,slug:'demo',name:'Demo university · synthetic test',coverage:'synthetic_demo'}],next_cursor:null}});return route.fulfill({status:503,json:error});});}
async function canvasShot(page:Page,name:string){const canvas=page.locator('canvas');await expect(canvas).toBeVisible();const hide=await page.addStyleTag({content:'.hero-content,.motion-control,.archive-shade{visibility:hidden!important}'});const bytes=await canvas.screenshot({path:`${artifacts}${name}.png`,animations:'allow'});await hide.evaluate(el=>el.remove());return createHash('sha256').update(bytes).digest('hex');}
test.beforeAll(async()=>{await mkdir(artifacts,{recursive:true});});
for(const size of [{name:'desktop',width:1440,height:900},{name:'wide',width:1920,height:1080},{name:'mobile',width:390,height:844}])test(`render ${size.name}: scene, responsive prompt, keyboard, failure`,async({page})=>{
 await page.setViewportSize(size);await fixture(page);await page.goto('/');await expect(page.getByRole('heading',{name:'noti.school',exact:true})).toBeVisible();await page.waitForTimeout(2200);
 await page.screenshot({path:`${artifacts}${size.name}.png`,fullPage:true});await page.screenshot({path:`${artifacts}${size.name}-viewport.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const prompt=page.getByLabel('Your question');await prompt.fill('Tôi có thể tìm quy chế học vụ và các biểu mẫu chính thức ở đâu? '.repeat(3));
 expect(await prompt.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})).toBe(true);
 await page.keyboard.press('Tab');await expect(page.getByLabel('Answer language')).toBeFocused();
 await page.getByRole('button',{name:'Ask',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Answers are temporarily unavailable');
 await expect(prompt).toHaveValue(/Tôi có thể/);await page.getByRole('link',{name:'Sign in',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Welcome to noti.school'})).toBeVisible();
 await page.getByLabel('Email',{exact:true}).fill('synthetic@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('status')).toContainText('unavailable');
 await page.getByRole('link',{name:'Sources',exact:true}).click();await expect(page.getByRole('alert')).toContainText('unavailable');
 await page.goto('/#/');await expect(page.getByLabel('Your question')).toHaveValue(/Tôi có thể/);
});
for(const size of [{name:'desktop',width:1440,height:900},{name:'wide',width:1920,height:1080},{name:'mobile',width:390,height:844}])test(`actual canvas pixels move, pause, and reduced-motion remain stable: ${size.name}`,async({page})=>{
 await page.setViewportSize(size);await fixture(page);await page.goto('/');await page.waitForTimeout(2500);
 const first=await canvasShot(page,`${size.name}-motion-a`);await page.waitForTimeout(550);const second=await canvasShot(page,`${size.name}-motion-b`);expect(first).not.toBe(second);
 await page.getByRole('button',{name:'Pause animation'}).click();await page.waitForTimeout(150);const paused=await canvasShot(page,`${size.name}-paused-a`);await page.waitForTimeout(550);expect(await canvasShot(page,`${size.name}-paused-b`)).toBe(paused);
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForTimeout(1000);const reduced=await canvasShot(page,`${size.name}-reduced-a`);await page.waitForTimeout(550);expect(await canvasShot(page,`${size.name}-reduced-b`)).toBe(reduced);
 // Decode actual screenshot pixels, independently of any DOM scene marker.
 const sharp=createRequire(new URL('../../apps/web/package.json',import.meta.url))('sharp');const stats=await sharp(`${artifacts}${size.name}-motion-a.png`).stats();expect(Math.max(...stats.channels.map((c:{stdev:number})=>c.stdev))).toBeGreaterThan(5);
 await writeFile(`${artifacts}${size.name}-canvas-evidence.json`,JSON.stringify({motionHashes:[first,second],pausedHash:paused,reducedHash:reduced,channelStandardDeviation:stats.channels.map((c:{stdev:number})=>c.stdev)},null,2));
});
test('WebGL failure retains bitmap and usable composer',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type==='webgl2'||type==='webgl')return null;return original.apply(this,[type,...args] as never); } as typeof original;});
 await fixture(page);await page.goto('/');await expect(page.locator('.archive')).toHaveClass(/fallback/);await expect(page.getByLabel('Your question')).toBeVisible();await expect(page.locator('.archive img')).toBeVisible();await page.screenshot({path:`${artifacts}webgl-fallback.png`});
});
test('immediate submit, one request, cancellation and context-loss fallback',async({page})=>{
 await fixture(page);let calls=0;let headers:Record<string,string>={};await page.route('**/api/v1/answers',async route=>{calls++;headers=route.request().headers();await new Promise(resolve=>setTimeout(resolve,1200));await route.fulfill({status:503,json:error}).catch(()=>{});});
 await page.goto('/');await expect(page.locator('canvas')).toBeVisible();await page.getByLabel('Your question').fill('Synthetic test question');const start=Date.now();await page.getByRole('button',{name:'Ask',exact:true}).click();await expect.poll(()=>calls).toBe(1);expect(Date.now()-start).toBeLessThan(1000);expect(headers['x-noti-csrf']).toBe('1');expect(headers['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('alert')).toContainText('cancelled');expect(calls).toBe(1);
 await page.goto('/#/');await expect(page.locator('canvas')).toBeVisible();await page.locator('canvas').evaluate(el=>el.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await expect(page.locator('.archive')).toHaveClass(/fallback/);
});
test('offscreen, hidden and disposed scene stops actual WebGL draws',async({page})=>{
 await page.addInitScript(()=>{const target=window as Window&{drawCount:number;simulatedHidden:boolean};target.drawCount=0;target.simulatedHidden=false;Object.defineProperty(document,'hidden',{get:()=>target.simulatedHidden});for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'] as const){const original=WebGL2RenderingContext.prototype[name];Object.defineProperty(WebGL2RenderingContext.prototype,name,{value:function(...args:number[]){target.drawCount++;return Reflect.apply(original,this,args);}});}});
 await page.setViewportSize({width:1440,height:500});await fixture(page);await page.goto('/');const draws=()=>page.evaluate(()=>(window as Window&{drawCount:number}).drawCount);await expect.poll(draws).toBeGreaterThan(0);
 await page.evaluate(()=>{(window as Window&{simulatedHidden:boolean}).simulatedHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(150);const hidden=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(hidden);
 await page.evaluate(()=>{(window as Window&{simulatedHidden:boolean}).simulatedHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(draws).toBeGreaterThan(hidden);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(400);const offscreen=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(offscreen);
 await page.getByRole('link',{name:'For institutions'}).click();await expect(page.locator('canvas')).toHaveCount(0);const disposed=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(disposed);
 await writeFile(`${artifacts}lifecycle-draws.json`,JSON.stringify({hidden,offscreen,disposed,afterDisposal:await draws(),hiddenSimulation:'document.hidden override + visibilitychange; offscreen uses real scrolling/IntersectionObserver'},null,2));
});

test('lazy scene import resolving after unmount creates no canvas',async({page})=>{
 await fixture(page);
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let requested=false;
 await page.route('**/assets/scene-*.js',async route=>{requested=true;await gate;await route.continue();});
 await page.goto('/');
 await expect.poll(()=>requested).toBe(true);
 await page.getByRole('link',{name:'For institutions'}).click();
 release();
 await page.waitForTimeout(500);
 await expect(page.locator('canvas')).toHaveCount(0);
 await page.goto('/#/');
 await expect(page.locator('canvas')).toHaveCount(1);
});

test('instanced GPU resources are released on repeated unmounts',async({page})=>{
 await page.addInitScript(()=>{
  const buffers=new Set<WebGLBuffer>(),programs=new Set<WebGLProgram>();
  const proto=WebGL2RenderingContext.prototype;
  const createBuffer=proto.createBuffer,deleteBuffer=proto.deleteBuffer,createProgram=proto.createProgram,deleteProgram=proto.deleteProgram;
  proto.createBuffer=function(){const value=createBuffer.call(this);if(value)buffers.add(value);return value;};
  proto.deleteBuffer=function(value){if(value)buffers.delete(value);deleteBuffer.call(this,value);};
  proto.createProgram=function(){const value=createProgram.call(this);if(value)programs.add(value);return value;};
  proto.deleteProgram=function(value){if(value)programs.delete(value);deleteProgram.call(this,value);};
  Object.defineProperty(window,'archiveResources',{get:()=>({buffers:buffers.size,programs:programs.size})});
 });
 await fixture(page);await page.goto('/');
 const resources=()=>page.evaluate(()=>(window as Window&{archiveResources:{buffers:number;programs:number}}).archiveResources);
 for(let cycle=0;cycle<3;cycle++){
  if(cycle)await page.goto('/#/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async()=>(await resources()).buffers).toBeGreaterThan(0);
  await page.getByRole('link',{name:'For institutions'}).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect.poll(resources).toEqual({buffers:0,programs:0});
 }
 await writeFile(`${artifacts}gpu-disposal.json`,JSON.stringify({cycles:3,...await resources()},null,2));
});

test('entry dolly and submit zoom dispatch immediately without replaying history on return home',async({page})=>{
 await page.addInitScript(()=>{
  const target=window as Window&{cameraDepths:number[];submitTime:number;requestTime:number;requestCount:number};
  target.cameraDepths=[];target.submitTime=0;target.requestTime=0;target.requestCount=0;
  document.addEventListener('submit',()=>{target.submitTime=performance.now();},true);
  const fetch=window.fetch;
  window.fetch=function(input,init){if(String(input).endsWith('/api/v1/answers')){target.requestTime=performance.now();target.requestCount++;}return fetch.call(this,input,init);};
  // The lit instanced batches have identity world transforms, so their model-view
  // translation measures the camera. viewMatrix alone is optimized out by GLSL.
  const cameraUniforms=new WeakMap<WebGL2RenderingContext,WebGLUniformLocation>();
  const proto=WebGL2RenderingContext.prototype;
  const location=proto.getUniformLocation,matrix=proto.uniformMatrix4fv;
  proto.getUniformLocation=function(program,name){const result=location.call(this,program,name);if(result&&!cameraUniforms.has(this)&&name==='modelViewMatrix')cameraUniforms.set(this,result);return result;};
  proto.uniformMatrix4fv=function(...args:Parameters<typeof matrix>){
   if(args[0]===cameraUniforms.get(this)&&target.cameraDepths.length<10000)target.cameraDepths.push(Number(args[2][14]));
   return matrix.apply(this,args);
  };
 });
 await fixture(page);await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await expect(page.locator('canvas')).toBeVisible();await page.waitForTimeout(2300);
 const entry=await page.evaluate(()=>(window as Window&{cameraDepths:number[]}).cameraDepths);
 expect(entry.length).toBeGreaterThan(2);
 expect(entry.at(-1)!-entry[0]!).toBeGreaterThan(0.2);
 await page.getByLabel('Your question').fill('Synthetic zoom question');
 await page.evaluate(()=>{(window as Window&{cameraDepths:number[]}).cameraDepths=[];});
 await page.getByRole('button',{name:'Ask',exact:true}).click();await page.waitForTimeout(700);
 const result=await page.evaluate(()=>{const target=window as Window&{cameraDepths:number[];submitTime:number;requestTime:number;requestCount:number};return {depths:target.cameraDepths,dispatchDelayMs:target.requestTime-target.submitTime,requestCount:target.requestCount};});
 expect(result.dispatchDelayMs).toBeGreaterThanOrEqual(0);expect(result.dispatchDelayMs).toBeLessThan(100);
 expect(result.requestCount).toBe(1);
 expect(Math.max(...result.depths)-entry.at(-1)!).toBeGreaterThan(0.4);
 await expect(page.locator('canvas')).toHaveCount(0);
 await page.evaluate(()=>{(window as Window&{cameraDepths:number[]}).cameraDepths=[];});
 // Navigate within the app: a reload would reset the historical submit counter.
 await page.locator('a.wordmark').click();
 await expect(page.locator('canvas')).toBeVisible();await page.waitForTimeout(2300);
 const returned=await page.evaluate(()=>{const target=window as Window&{cameraDepths:number[];requestCount:number};return {depths:target.cameraDepths,requestCount:target.requestCount};});
 expect(returned.requestCount).toBe(1);
 expect(returned.depths.length).toBeGreaterThan(2);
 expect(returned.depths[0]).toBeLessThan(-13);
 expect(returned.depths.at(-1)!-returned.depths[0]!).toBeGreaterThan(0.2);
 expect(Math.max(...returned.depths)).toBeLessThan(-11.8);
 await page.getByLabel('Your question').fill('Synthetic subsequent zoom question');
 await page.evaluate(()=>{(window as Window&{cameraDepths:number[]}).cameraDepths=[];});
 await page.getByRole('button',{name:'Ask',exact:true}).click();await page.waitForTimeout(700);
 const subsequent=await page.evaluate(()=>{const target=window as Window&{cameraDepths:number[];submitTime:number;requestTime:number;requestCount:number};return {depths:target.cameraDepths,dispatchDelayMs:target.requestTime-target.submitTime,requestCount:target.requestCount};});
 expect(subsequent.requestCount).toBe(2);
 expect(subsequent.dispatchDelayMs).toBeGreaterThanOrEqual(0);expect(subsequent.dispatchDelayMs).toBeLessThan(100);
 expect(Math.max(...subsequent.depths)-returned.depths.at(-1)!).toBeGreaterThan(0.4);
 await writeFile(`${artifacts}camera-request-evidence.json`,JSON.stringify({entryStart:entry[0],entryEnd:entry.at(-1),...result,returned,subsequent},null,2));
});
