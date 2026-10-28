import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
const id='11111111-1111-4111-8111-111111111111';
const sourceId='22222222-2222-4222-8222-222222222222';
const versionId='33333333-3333-4333-8333-333333333333';
const citationId='44444444-4444-4444-8444-444444444444';
const time='2026-09-25T00:00:00Z';
const source={id:sourceId,institution_id:id,title:'Demo · Quy chế tổng hợp dành cho sinh viên — tài liệu thử nghiệm không phải chính sách',kind:'text',original_url:'https://example.test/demo',visibility:'institution',current_version_id:versionId,created_at:time};
const version={id:versionId,institution_id:id,source_id:sourceId,label:'Demo v1',sha256:'a'.repeat(64),status:'archived',indexing:'ready',effective_from:null,effective_until:'2025-01-01T00:00:00Z',created_at:time};
const evidence={id:citationId,institution_id:id,source_id:sourceId,version_id:versionId,chunk_id:id,title:source.title,version_label:'Demo v1',locator:{page:2,section:'Synthetic section',start_char:0,end_char:40},quote:'Synthetic passage. <img src=x onerror=alert(1)>',original_url:'https://example.test/demo'};
const answer={id,conversation_id:id,institution_id:id,status:'qualified',language:'vi',claims:[{text:'Demo answer for component testing only. Đây không phải quy định của trường đại học.',evidence_ids:[citationId]}],evidence:[evidence],explanation:'Synthetic fixture · no live provider used.',created_at:time};
async function setup(page:Page,admin=false){await page.emulateMedia({reducedMotion:'reduce'});await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;const method=route.request().method();let body:unknown;
 if(path.endsWith('/capabilities')){const cap={state:'available',reason:'ready'};body={mode:'mock',answers:cap,indexing:cap,discovery:cap,google:cap,email:cap,identity:cap};}
 else if(path.endsWith('/institutions'))body={items:[{id,slug:'demo',name:'Demo university',coverage:'synthetic_demo'}],next_cursor:null};
 else if(path.endsWith('/me'))body={identity:{user_id:'synthetic-test-user',session_id:'synthetic-session',email_verified:true,expires_at:'2027-01-01T00:00:00Z'},memberships:[{institution_id:id,role:admin?'admin':'student'}]};
 else if(path.endsWith('/conversations'))body={items:[{id,institution_id:id,created_at:time}],next_cursor:null};
 else if(path.endsWith('/graph'))body={items:[],next_cursor:null};
 else if(path.endsWith('/answers'))body=method==='POST'?answer:{items:[answer],next_cursor:null};
 else if(path.includes('/citations/'))body=evidence;
 else if(path.includes('/chunks/'))body={id,institution_id:id,source_id:sourceId,version_id:versionId,ordinal:0,text:'Synthetic full passage only.',locator:evidence.locator,language:'vi'};
 else if(path.endsWith('/sources'))body=method==='POST'?source:{items:[source],next_cursor:null};
 else if(path.endsWith(`/sources/${sourceId}`))body=source;
 else if(path.endsWith('/versions')&&method==='GET')body={items:[version],next_cursor:null};
 else if(path.endsWith(`/versions/${versionId}`))body=version;
 else if(path.endsWith('/budget'))body={month:'2026-09',cap_micro_usd:50000000,spent_micro_usd:1250000,reserved_micro_usd:500000,currency:'USD'};
 else if(path.endsWith('/feedback'))body=method==='GET'?{items:[],next_cursor:null}:{id,institution_id:id,answer_id:id,category:'unsupported',evidence_id:null,comment:'Synthetic feedback',status:'open',created_at:time};
 else if(path.includes('/jobs/')||path.endsWith('/actions')||path.endsWith('/versions'))body={id,institution_id:id,version_id:versionId,state:'queued',error_code:null};
 if(body)return route.fulfill({json:body,status:method==='POST'&&path.endsWith('/feedback')?201:200});return route.fulfill({status:503,json:{error:{code:'core_unavailable',message:'Synthetic unavailable',request_id:id,retryable:false}}});});}
test('answer, citation, archived version, safe text, feedback and followup contracts',async({page})=>{
 await setup(page);await page.goto('/');await page.getByLabel('Your question').fill('Synthetic question');await page.getByRole('button',{name:'Ask',exact:true}).click();await expect(page.getByText('Demo answer for component testing only.',{exact:false})).toBeVisible();
 await page.getByTitle('Open source citation').click();await expect(page.getByText('Expired version · historical citation')).toBeVisible();await expect(page.getByRole('article',{name:'Source citation'})).toBeFocused();await expect(page.getByText('Synthetic passage. <img src=x onerror=alert(1)>',{exact:true})).toBeVisible();expect(await page.locator('.reader img').count()).toBe(0);await page.screenshot({path:new URL('./artifacts/citation.png',import.meta.url).pathname,fullPage:true});
 await page.getByRole('button',{name:'Report an issue'}).click();await page.getByLabel('Comment',{exact:true}).fill('Synthetic feedback');await page.getByRole('button',{name:'Send feedback'}).click();await expect(page.getByText('Feedback received. Thank you.')).toBeVisible();
 const next=page.waitForRequest(req=>req.url().endsWith('/api/v1/answers')&&req.method()==='POST');await page.getByLabel('Your question').fill('Synthetic follow-up');await page.getByRole('button',{name:'Ask',exact:true}).click();expect((await next).postDataJSON().conversation_id).toBe(id);
 await page.screenshot({path:new URL('./artifacts/workspace.png',import.meta.url).pathname,fullPage:true});
 await page.getByRole('link',{name:'History',exact:true}).click();await page.getByRole('link',{name:'Open conversation'}).click();await expect(page.getByRole('button',{name:/View answer/})).toBeVisible();
});
test('mobile source reader fits long Vietnamese title',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.goto(`/#/sources/${sourceId}`);await expect(page.getByRole('heading',{name:source.title})).toBeVisible();await expect(page.getByRole('link',{name:'Open original version'})).toHaveAttribute('href',new RegExp(`/versions/${versionId}/file`));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:new URL('./artifacts/mobile-source.png',import.meta.url).pathname,fullPage:true});
});
test('admin is membership gated; source creation, upload and actions use real endpoint shapes',async({page})=>{
 await setup(page,true);await page.goto('/#/admin');await expect(page.getByRole('heading',{name:'Monthly AI budget'})).toBeVisible();await expect(page.getByText('$1.25',{exact:true})).toBeVisible();await page.getByLabel('Document title').fill('Synthetic source');await page.getByRole('button',{name:'Create source',exact:true}).click();await expect(page.getByRole('heading',{name:'Upload a version'})).toBeVisible();await page.getByLabel('Version label').fill('Demo v2');await page.getByLabel('PDF or UTF-8 text').setInputFiles({name:'demo.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic test only.')});const upload=page.waitForRequest(req=>req.url().endsWith('/versions')&&req.method()==='POST');await page.getByRole('button',{name:'Upload version',exact:true}).click();const sent=await upload;expect(sent.headers()['x-noti-csrf']).toBe('1');expect(sent.postData()).toContain('Demo v2');await expect(page.getByText('queued',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Approve',exact:true}).click();await page.screenshot({path:new URL('./artifacts/admin.png',import.meta.url).pathname,fullPage:true});
});
test('student cannot see admin controls',async({page})=>{await setup(page);await page.goto('/#/admin');await expect(page.getByText('Sign in with an administrator membership')).toBeVisible();await expect(page.getByRole('button',{name:'Create source'})).toHaveCount(0);});
test('auth reset callback and invitation header are wired without persisting secrets',async({page})=>{
 await setup(page);await page.goto('/?token=synthetic-reset-token#/auth');await expect(page.locator('form h2')).toHaveText('Reset password');expect(page.url()).not.toContain('token=');await page.getByLabel('New password (when using a reset token)').fill('synthetic-new-password');const reset=page.waitForRequest(r=>r.url().endsWith('/reset-password'));await page.getByRole('button',{name:'Continue',exact:true}).click();expect((await reset).postDataJSON()).toEqual({token:'synthetic-reset-token',newPassword:'synthetic-new-password'});
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('synthetic@example.test');await page.getByLabel('Name',{exact:true}).fill('Synthetic');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.getByLabel('Invitation token',{exact:true}).fill('synthetic-invite');const signup=page.waitForRequest(r=>r.url().endsWith('/sign-up/email'));await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();expect((await signup).headers()['x-noti-invitation']).toBe('synthetic-invite');expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain('synthetic-password');
});
test('source pagination sends opaque cursor and keeps authenticated scope',async({page})=>{
 await setup(page);await page.route('**/api/v1/institutions/*/sources*',async route=>{const cursor=new URL(route.request().url()).searchParams.get('cursor');await route.fulfill({json:{items:[{...source,title:cursor?'Demo second page':'Demo first page'}],next_cursor:cursor?null:'opaque_demo_cursor'}});});await page.goto('/#/sources');await expect(page.getByRole('link',{name:/Demo first page/})).toBeVisible();await page.getByRole('button',{name:'Next page'}).click();await expect(page.getByRole('link',{name:/Demo second page/})).toBeVisible();await page.getByRole('button',{name:'First page'}).click();await expect(page.getByRole('link',{name:/Demo first page/})).toBeVisible();
});

test('history loads after reload, paginates and surfaces a missing backend',async({page})=>{
 await setup(page);let reads=0;
 await page.route('**/conversations*',async route=>{if(!new URL(route.request().url()).pathname.endsWith('/conversations'))return route.fallback();reads++;await route.fulfill({json:{items:[{id,institution_id:id,created_at:time}],next_cursor:reads===1?'opaque_history':null}});});
 await page.goto('/#/history');await expect(page.getByRole('link',{name:'Open conversation'})).toBeVisible();
 const next=page.waitForRequest(r=>r.url().includes('cursor=opaque_history'));await page.getByRole('button',{name:'Next page'}).click();await next;
 await page.reload();await expect(page.getByRole('link',{name:'Open conversation'})).toBeVisible();expect(reads).toBeGreaterThan(2);
 await page.route('**/conversations*',route=>route.fulfill({status:503,json:{error:{code:'core_unavailable',message:'Synthetic missing backend',request_id:id,retryable:true}}}));
 await page.reload();await expect(page.getByRole('alert')).toContainText('unavailable');await expect(page.getByRole('link',{name:'Open conversation'})).toHaveCount(0);
});

test('saved URL fetch submits Vietnamese metadata and never claims indexed evidence',async({page})=>{
 await setup(page,true);
 await page.route('**/sources',route=>route.fulfill({json:{items:[{...source,kind:'url',original_url:'https://edusoftweb.hcmiu.edu.vn/synthetic-only'}],next_cursor:null}}));
 await page.goto('/#/admin');await page.getByLabel('Select source').selectOption(sourceId);
 await page.getByLabel('Version label').fill('Synthetic vi');await page.getByLabel('Document language').selectOption('vi');
 const sent=page.waitForRequest(r=>r.url().endsWith('/fetch'));
 await page.getByRole('button',{name:'Fetch saved URL',exact:true}).click();
 const req=await sent;expect(req.postDataJSON()).toEqual({label:'Synthetic vi',language:'vi',effective_from:null,effective_until:null});
 expect(req.headers()['x-noti-csrf']).toBe('1');expect(req.headers()['idempotency-key']).toBeTruthy();
 await expect(page.getByRole('status').filter({hasText:'unavailable'})).toBeVisible();
});

test('deletion confirms through POST, strips callback token and shows cleanup failure',async({page})=>{
 await setup(page);
 await page.route('**/api/auth/delete-user',route=>route.fulfill({status:503,json:{error:{code:'core_unavailable',message:'Synthetic cleanup failure',request_id:id,retryable:true}}}));
 await page.goto('/#/auth?delete_token=synthetic-delete');
 expect(page.url()).not.toContain('synthetic-delete');
 page.on('dialog',dialog=>dialog.accept());
 const sent=page.waitForRequest(r=>r.url().endsWith('/delete-user'));
 await page.getByRole('button',{name:'Confirm account deletion'}).click();
 expect((await sent).postDataJSON()).toEqual({token:'synthetic-delete'});
 await expect(page.getByRole('status')).toContainText('unavailable');
 expect(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).not.toContain('synthetic-delete');
});

test('OAuth errors are readable, hash reset is scrubbed, and draft survives account navigation',async({page})=>{
 await setup(page);await page.goto('/');await page.getByLabel('Your question').fill('Synthetic persistent draft');
 await page.goto('/#/auth/error?error=synthetic-private-detail');
 await expect(page.getByRole('status')).toContainText('could not be completed');expect(page.url()).not.toContain('synthetic-private-detail');
 await page.goto('/#/auth?token=synthetic-hash-reset');await expect(page.locator('form h2')).toHaveText('Reset password');expect(page.url()).not.toContain('synthetic-hash-reset');
 await page.getByRole('link',{name:'Return to your question',exact:true}).click();await expect(page.getByLabel('Your question')).toHaveValue('Synthetic persistent draft');
});

test('transition leaves one composer and disabled identity remains explicit',async({page})=>{
 await setup(page);await page.emulateMedia({reducedMotion:'no-preference'});
 await page.route('**/api/v1/answers',async route=>{await new Promise(r=>setTimeout(r,800));await route.fulfill({json:answer});});
 await page.goto('/');await page.getByLabel('Your question').fill('Synthetic transition');await page.getByRole('button',{name:'Ask',exact:true}).click();
 await expect(page.locator('#question')).toHaveCount(1);await expect(page.locator('[data-site-page="home"]')).toHaveCount(0);
 await page.route('**/capabilities',route=>{const cap={state:'disabled',reason:'not_configured'};return route.fulfill({json:{mode:'disabled',answers:cap,indexing:cap,discovery:cap,google:cap,email:cap,identity:cap}});});
 await page.goto('/#/auth');await expect(page.getByRole('button',{name:'Continue with Google'})).toBeDisabled();await expect(page.getByRole('button',{name:'Request account deletion'})).toBeDisabled();
});

test('graph administration uses provenance contracts and exposes unavailable writes',async({page})=>{
 await setup(page,true);await page.goto('/#/admin');await page.getByText('Evidence graph administration',{exact:true}).click();
 await expect(page.getByText('No graph relations returned for this institution.')).toBeVisible();
 await page.getByLabel('Entity label').fill('Synthetic office');await page.getByLabel('Entity kind').selectOption('office');
 const sent=page.waitForRequest(r=>r.url().endsWith('/graph/entities'));
 await page.getByRole('button',{name:'Create graph entity'}).click();expect((await sent).postDataJSON()).toEqual({kind:'office',label:'Synthetic office'});
 await expect(page.getByRole('status').filter({hasText:'unavailable'})).toBeVisible();
 await page.getByLabel('From entity ID').fill(id);await page.getByLabel('To entity ID').fill(sourceId);await page.getByLabel('Relation',{exact:true}).fill('synthetic relation');await page.getByLabel('Evidence chunk ID').fill(versionId);
 const edge=page.waitForRequest(r=>r.url().endsWith('/graph/edges'));await page.getByRole('button',{name:'Create candidate relation'}).click();
 expect((await edge).postDataJSON()).toEqual({from_entity_id:id,to_entity_id:sourceId,relation:'synthetic relation',evidence_chunk_id:versionId});
 await expect(page.getByRole('button',{name:'Approve relation'})).toHaveCount(0);
});
