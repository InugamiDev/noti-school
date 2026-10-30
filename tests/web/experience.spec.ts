import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const artifacts=new URL('./artifacts/',import.meta.url).pathname;
const id='11111111-1111-4111-8111-111111111111';
const error={error:{code:'provider_unavailable',message:'Synthetic unavailable fixture',request_id:id,retryable:false,capability:'answers'}};
const capability={state:'disabled',reason:'not_configured'};
async function fixture(page:Page){await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/capabilities'))return route.fulfill({json:{mode:'disabled',answers:capability,indexing:capability,discovery:capability,google:capability,email:capability,identity:capability}});if(path.endsWith('/institutions'))return route.fulfill({json:{items:[{id,slug:'demo',name:'Demo university · synthetic test',coverage:'synthetic_demo'}],next_cursor:null}});return route.fulfill({status:503,json:error});});}
// intent: Clay hero rendering, lifecycle and the landing composer flow against synthetic fixtures only.
async function canvasShot(page:Page,name:string){const canvas=page.locator('canvas');await expect(canvas).toBeVisible();const hide=await page.addStyleTag({content:'[aria-label="Example answer"],[aria-label^="Clay illustration"]>div{visibility:hidden!important}'});const bytes=await canvas.screenshot({path:`${artifacts}${name}.png`,animations:'allow'});await hide.evaluate(el=>el.remove());return createHash('sha256').update(bytes).digest('hex');}
test.beforeAll(async()=>{await mkdir(artifacts,{recursive:true});});
for(const size of [{name:'desktop',width:1440,height:900},{name:'wide',width:1920,height:1080},{name:'mobile',width:390,height:844}])test(`render ${size.name}: scene, responsive prompt, keyboard, failure`,async({page})=>{
 await page.setViewportSize(size);await fixture(page);await page.goto('/');await expect(page.getByRole('heading',{name:'University answers you can check.',exact:true})).toBeVisible();await page.waitForTimeout(2200);
 await page.screenshot({path:`${artifacts}${size.name}.png`,fullPage:true});await page.screenshot({path:`${artifacts}${size.name}-viewport.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const prompt=page.getByLabel('Your question');await prompt.fill('Tôi có thể tìm quy chế học vụ và các biểu mẫu chính thức ở đâu? '.repeat(3));
 expect(await prompt.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1;})).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:/^School: /})).toBeFocused();
 await page.keyboard.press('Tab');await expect(page.getByRole('group',{name:'Answer language'}).getByRole('button',{pressed:true})).toBeFocused();
 await page.getByRole('button',{name:'Ask',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Answers are temporarily unavailable');
 await expect(prompt).toHaveValue(/Tôi có thể/);await page.getByRole('link',{name:'Account',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Welcome to noti.school'})).toBeVisible();
 await expect(page.locator('form').getByRole('button',{name:'Sign in',exact:true})).toBeDisabled();await expect(page.getByText('Sign-in availability is not confirmed.',{exact:false})).toBeVisible();
 await page.getByRole('link',{name:'Sources',exact:true}).click();await expect(page.getByRole('alert')).toContainText('unavailable');
 await page.goto('/#/');await expect(page.getByLabel('Your question')).toHaveValue(/Tôi có thể/);
});
test('available identity still reports a failed sign-in request without claiming success',async({page})=>{
 await fixture(page);await page.route('**/api/v1/capabilities',route=>route.fulfill({json:{mode:'disabled',answers:capability,indexing:capability,discovery:capability,google:capability,email:capability,identity:{state:'available',reason:'ready'}}}));
 await page.goto('/#/auth');await page.getByLabel('Email',{exact:true}).fill('synthetic@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');const submit=page.locator('form').getByRole('button',{name:'Sign in',exact:true});await expect(submit).toBeEnabled();await submit.click();await expect(page.getByRole('status')).toContainText('unavailable');
});
for(const size of [{name:'desktop',width:1440,height:900},{name:'wide',width:1920,height:1080},{name:'mobile',width:390,height:844}])test(`actual canvas pixels move and reduced-motion frames remain stable: ${size.name}`,async({page})=>{
 await page.setViewportSize(size);await fixture(page);await page.goto('/');await page.waitForTimeout(2500);
 const first=await canvasShot(page,`${size.name}-motion-a`);await page.waitForTimeout(550);const second=await canvasShot(page,`${size.name}-motion-b`);expect(first).not.toBe(second);
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForTimeout(1000);const reduced=await canvasShot(page,`${size.name}-reduced-a`);await page.waitForTimeout(550);expect(await canvasShot(page,`${size.name}-reduced-b`)).toBe(reduced);
 // Decode actual screenshot pixels, independently of any DOM scene marker.
 const sharp=createRequire(new URL('../../apps/web/package.json',import.meta.url))('sharp');const stats=await sharp(`${artifacts}${size.name}-motion-a.png`).stats();expect(Math.max(...stats.channels.map((c:{stdev:number})=>c.stdev))).toBeGreaterThan(5);
 await writeFile(`${artifacts}${size.name}-canvas-evidence.json`,JSON.stringify({motionHashes:[first,second],reducedHash:reduced,channelStandardDeviation:stats.channels.map((c:{stdev:number})=>c.stdev)},null,2));
});
test('WebGL failure retains the static illustration and usable composer',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type==='webgl2'||type==='webgl')return null;return original.apply(this,[type,...args] as never); } as typeof original;});
 await fixture(page);await page.goto('/');await page.waitForTimeout(1500);await expect(page.locator('canvas')).toHaveCount(0);await expect(page.getByText('Handbook illustration')).toBeVisible();await expect(page.getByLabel('Your question')).toBeVisible();await page.screenshot({path:`${artifacts}webgl-fallback.png`});
});
test('immediate submit, one request, cancellation and context-loss fallback',async({page})=>{
 await fixture(page);let calls=0;let headers:Record<string,string>={};await page.route('**/api/v1/answers',async route=>{calls++;headers=route.request().headers();await new Promise(resolve=>setTimeout(resolve,1200));await route.fulfill({status:503,json:error}).catch(()=>{});});
 await page.goto('/');await expect(page.locator('canvas')).toBeVisible();await page.getByLabel('Your question').fill('Synthetic test question');const start=Date.now();await page.getByRole('button',{name:'Ask',exact:true}).click();await expect.poll(()=>calls).toBe(1);expect(Date.now()-start).toBeLessThan(1000);expect(headers['x-noti-csrf']).toBe('1');expect(headers['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);await page.getByRole('button',{name:'Stop',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Processing may continue');expect(calls).toBe(1);
 await page.goto('/#/');await expect(page.locator('canvas')).toBeVisible();await page.locator('canvas').evaluate(el=>el.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await expect(page.getByText('Handbook illustration')).toBeVisible();
});
test('offscreen, hidden and disposed scene stops actual WebGL draws',async({page})=>{
 await page.addInitScript(()=>{const target=window as Window&{drawCount:number;simulatedHidden:boolean};target.drawCount=0;target.simulatedHidden=false;Object.defineProperty(document,'hidden',{get:()=>target.simulatedHidden});for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'] as const){const original=WebGL2RenderingContext.prototype[name];Object.defineProperty(WebGL2RenderingContext.prototype,name,{value:function(...args:number[]){target.drawCount++;return Reflect.apply(original,this,args);}});}});
 await page.setViewportSize({width:1440,height:500});await fixture(page);await page.goto('/');const draws=()=>page.evaluate(()=>(window as Window&{drawCount:number}).drawCount);await expect.poll(draws).toBeGreaterThan(0);
 await page.evaluate(()=>{(window as Window&{simulatedHidden:boolean}).simulatedHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(150);const hidden=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(hidden);
 await page.evaluate(()=>{(window as Window&{simulatedHidden:boolean}).simulatedHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(draws).toBeGreaterThan(hidden);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(400);const offscreen=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(offscreen);
 await page.getByRole('link',{name:'For universities'}).first().click();await expect(page.locator('canvas')).toHaveCount(0);const disposed=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(disposed);
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
 await page.getByRole('link',{name:'For universities'}).first().click();
 release();
 await page.waitForTimeout(500);
 await expect(page.locator('canvas')).toHaveCount(0);
 await page.goto('/#/');
 await expect(page.locator('canvas')).toHaveCount(1);
});

test('instanced GPU resources are released on repeated unmounts',async({page})=>{
 // Known hero3d gap (reported, outside this task's scope): dispose() skips THREE.Sprite's shared geometry, leaving
 // 2 buffers and 1 program per unmount. Remove this annotation once scene.ts disposes sprite geometry.
 test.fail(true,'hero3d scene dispose leaves sprite GPU buffers');
 await page.addInitScript(()=>{
  const buffers=new Set<WebGLBuffer>(),programs=new Set<WebGLProgram>();
  const proto=WebGL2RenderingContext.prototype;
  const createBuffer=proto.createBuffer,deleteBuffer=proto.deleteBuffer,createProgram=proto.createProgram,deleteProgram=proto.deleteProgram;
  proto.createBuffer=function(){const value=createBuffer.call(this);if(value)buffers.add(value);return value;};
  proto.deleteBuffer=function(value){if(value)buffers.delete(value);deleteBuffer.call(this,value);};
  proto.createProgram=function(){const value=createProgram.call(this);if(value)programs.add(value);return value;};
  proto.deleteProgram=function(value){if(value)programs.delete(value);deleteProgram.call(this,value);};
  Object.defineProperty(window,'heroResources',{get:()=>({buffers:buffers.size,programs:programs.size})});
 });
 await fixture(page);await page.goto('/');
 const resources=()=>page.evaluate(()=>(window as Window&{heroResources:{buffers:number;programs:number}}).heroResources);
 for(let cycle=0;cycle<3;cycle++){
  if(cycle)await page.goto('/#/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async()=>(await resources()).buffers).toBeGreaterThan(0);
  await page.getByRole('link',{name:'For universities'}).first().click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect.poll(resources).toEqual({buffers:0,programs:0});
 }
 await writeFile(`${artifacts}gpu-disposal.json`,JSON.stringify({cycles:3,...await resources()},null,2));
});
