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
test('actual canvas pixels move, pause, and reduced-motion remain stable',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await fixture(page);await page.goto('/');await page.waitForTimeout(2500);
 const first=await canvasShot(page,'motion-a');await page.waitForTimeout(550);const second=await canvasShot(page,'motion-b');expect(first).not.toBe(second);
 await page.getByRole('button',{name:'Pause animation'}).click();await page.waitForTimeout(150);const paused=await canvasShot(page,'paused-a');await page.waitForTimeout(550);expect(await canvasShot(page,'paused-b')).toBe(paused);
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForTimeout(1000);const reduced=await canvasShot(page,'reduced-a');await page.waitForTimeout(550);expect(await canvasShot(page,'reduced-b')).toBe(reduced);
 // Decode actual screenshot pixels, independently of any DOM scene marker.
 const sharp=createRequire(new URL('../../apps/web/package.json',import.meta.url))('sharp');const stats=await sharp(`${artifacts}motion-a.png`).stats();expect(Math.max(...stats.channels.map((c:{stdev:number})=>c.stdev))).toBeGreaterThan(5);
 await writeFile(`${artifacts}canvas-evidence.json`,JSON.stringify({motionHashes:[first,second],pausedHash:paused,reducedHash:reduced,channelStandardDeviation:stats.channels.map((c:{stdev:number})=>c.stdev)},null,2));
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
 await page.addInitScript(()=>{const target=window as Window&{drawCount:number;simulatedHidden:boolean};target.drawCount=0;target.simulatedHidden=false;Object.defineProperty(document,'hidden',{get:()=>target.simulatedHidden});const original=WebGL2RenderingContext.prototype.drawElements;WebGL2RenderingContext.prototype.drawElements=function(...args:Parameters<typeof original>){target.drawCount++;return original.apply(this,args);};});
 await page.setViewportSize({width:1440,height:500});await fixture(page);await page.goto('/');const draws=()=>page.evaluate(()=>(window as Window&{drawCount:number}).drawCount);await expect.poll(draws).toBeGreaterThan(0);
 await page.evaluate(()=>{(window as Window&{simulatedHidden:boolean}).simulatedHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(150);const hidden=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(hidden);
 await page.evaluate(()=>{(window as Window&{simulatedHidden:boolean}).simulatedHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(draws).toBeGreaterThan(hidden);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(400);const offscreen=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(offscreen);
 await page.getByRole('link',{name:'For institutions'}).click();await expect(page.locator('canvas')).toHaveCount(0);const disposed=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(disposed);
});
