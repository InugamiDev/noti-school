import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root=resolve(new URL('../../',import.meta.url).pathname);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function walk(path){const paths=[];for(const entry of await readdir(path,{withFileTypes:true})){if(['node_modules','dist','.cache','runs'].includes(entry.name))continue;const file=path+'/'+entry.name;if(entry.isDirectory())paths.push(...await walk(file));else paths.push(file);}return paths;}
const loaded=[
 'AGENTS.md','README.md','docs/product-spec.md','docs/architecture.md','docs/services.md','docs/deployment.md','docs/acceptance.md','docs/design/interaction-brief.md',
 'docs/contracts/README.md','docs/contracts/api.md','docs/contracts/database.md','docs/contracts/environment.md','docs/contracts/dependencies.md','docs/contracts/endpoints.json','docs/contracts/knowledge-receipt.json','packages/contracts/src/index.ts','package.json','pnpm-workspace.yaml','tsconfig.base.json',
 '/home/inu/.claude/CLAUDE.md','/home/inu/.codex/AGENTS.md','/home/inu/ultrathink/AGENTS.md','/home/inu/ultrathink/CLAUDE.md','/home/inu/ultrathink/.ckignore',
 '/home/inu/.codex/skills/ultra-ui/SKILL.md','/home/inu/fleet-repo/.agents/skills/ux-compiler/SKILL.md','/home/inu/fleet-repo/.agents/skills/uncodixfy/SKILL.md','/home/inu/fleet-repo/.claude/skills/ux-compiler/SKILL.md','/home/inu/fleet-repo/.claude/skills/uncodixfy/SKILL.md',
 ...['AGENTS.md','CLAUDE.md','global-CLAUDE.md','execution-contract.md','knowledge-contract.md','MANIFEST.sha256'].map(p=>'/home/inu/.ultrathink/campaigns/noti-runner-20260925/context/'+p),
 ...['app-wave-common.md','web-ORDER.md','MANIFEST.sha256'].map(p=>'/home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/orders/'+p),
 '/home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/auth/apps/auth/src/invitations.ts',
];
const knowledge=[];
for(const item of loaded){const path=resolve(root,item);knowledge.push({path,sha256:hash(await readFile(path)),state:'loaded'});}
for(const item of ['CLAUDE.md','.ckignore'])knowledge.push({path:resolve(root,item),state:'missing',blocking:false});
const sourcePaths=[...await walk(root+'/apps/web'),...await walk(root+'/tests/web')].filter(p=>!p.includes('/artifacts/'));
sourcePaths.push(root+'/docs/scratch/web-task-ledger.md');
let patch='';for(const path of sourcePaths){const run=spawnSync('git',['diff','--no-index','--binary','--','/dev/null',path.slice(root.length+1)],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});if(run.status!==0&&run.status!==1)throw new Error('Diff failed: '+path);patch+=run.stdout;}
await writeFile(root+'/tests/web/artifacts/implementation.patch',patch);
const artifactPaths=[...sourcePaths,...await walk(root+'/tests/web/artifacts'),root+'/.handoff/handoff-25-sep-2026-0449.md'];
const artifacts=[];for(const path of artifactPaths){const bytes=await readFile(path);artifacts.push({path:path.slice(root.length+1),sha256:hash(bytes),bytes:bytes.length});}
const tests=JSON.parse(await readFile(root+'/tests/web/artifacts/commands.json','utf8'));
if(tests.length!==4||tests.some(t=>t.exit!==0))throw new Error('Final tests have not all passed');
const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
const sharedDiff=spawnSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).stdout.trim();
if(sharedDiff)throw new Error('Unexpected tracked shared edits: '+sharedDiff);
const buildFiles=await walk(root+'/apps/web/dist/assets');
const bundle=[];for(const path of buildFiles){const bytes=await readFile(path);const {gzipSync}=await import('node:zlib');bundle.push({path:path.slice(root.length+1),bytes:bytes.length,gzip_bytes:gzipSync(bytes).length});}
const result={
 status:'implemented_tested_with_synthetic_contracts_pending_coordinator_audit',task:'NOTI-4',owner:'InugamiDev',campaign:'noti-school-pilot-20260925',remote:'inugami',target_root:root,harness_root:'/home/inu/ultrathink',base_sha:head,
 initial_state:{exact_sha_verified:true,origin:'git@github.com:InugamiDev/noti-school.git',clean_worktree_verified_before_edits:true,orders_manifest:'all 4 entries OK',policy_manifest:'all 5 entries OK'},
 runtime:{requested_model:'gpt-6-astra',requested_effort:'high',children_spawned:0,model_fallback:false,note:'No separate launcher telemetry was available; no config or model switches made.'},
 actual_changes:['Client-only SolidJS/Vite app with stable prompt, institutional coverage, bilingual drafts and source collection preview','Validated same-origin API boundary, CSRF, idempotent ask, cancellation, scoped follow-ups and session-local history IDs','Lazy direct Three archive, entry/idle/pointer/submit motion, initial reduced-motion, pause, hidden/offscreen suspension, context-loss fallback and complete disposal','Answer/citation/version/page/expiry reader, source library and pagination, safe text and HTTPS original links','Password, Google, invitation, verification and reset forms; X-Noti-Invitation header aligned to observed identity worker; callback reset token removed from URL','Admin source/version upload/review/actions, job refresh, feedback moderation and budget from real endpoints','Reproducible optimized approved bitmap with provenance; design contract, screenshots, pixel evidence and command transcripts'],
 knowledge_receipt:{sources:knowledge,overrides:['Current ORDER forbids children and deployment and overrides legacy delegation/model rules.','Skill docs output restricted to apps/web/design by explicit file scope.','Installed canonical defaults are stale relative to supplied policy packet; no harness writes.','Supplied global policy retains legacy model text; current Astra-only ORDER wins.'],memory:'Scoped read-only search in the two checked project memory directories returned no noti.school matches; no unrelated private recall or DB queries.',hook_provenance:'Global Codex AGENTS resolves to /home/inu/fleet-repo/AGENTS.md; hooks.json is a local regular file. No global runtime changes.',identity_integration:'Read-only sibling worker invitation header implementation is observed, not independently accepted; coordinator must freeze it with combined services.'},
 tests,results:{unit_tests:5,browser_tests:13,production_mocks:false,canvas:'Actual canvas region captured with HTML overlays hidden; nonuniform RGB pixels, changed moving frames, identical paused/reduced frames. Additional actual WebGL draw instrumentation checks hidden/offscreen/disposed stop.',screenshots:'Desktop 1440x900, wide 1920x1080, mobile 390x844; viewport and full-page files retained; source, citation, answer, admin and fallback captures inspected.',bundle},
 required_shared_changes:['Coordinator must regenerate pnpm-lock.yaml with the apps/web importer and exact Three/lucide/playwright/sharp/@types pins; worker install used --lockfile=false.','Coordinator must record X-Noti-Invitation on native signup/social in the identity integration contract; no public endpoint paths changed.'],
 unverified_surfaces:['Real backend/database sessions, authorization enforcement and cross-service integration','Real Google OAuth, invitation redemption, reset/verification replay and SMTP delivery','Live OpenAI/Jev availability, retrieval quality, bilingual evidence support, paid-call budget enforcement','Production PM2/tunnel/DNS/deployment, independent reviews and acceptance','Safari/Firefox, physical mobile GPU behavior and measured performance metrics','Design pipeline/linter unavailable due missing commander in read-only skill install; manually recorded contract is not a lint pass'],
 limitations:['Frozen API has no account-wide conversation-list endpoint; history lists only conversations opened during this app session.','Lazy Three chunk exceeds Vite 500KB warning threshold; exact raw/gzip sizes recorded, no speed claim.','Native password and Google flows depend on the observed invitation header convention becoming a coordinator-frozen integration detail.'],
 failures_resolved:['Zod generic assertion typing','Empty CSS import','Occupied dev port and host file-watcher exhaustion: isolated built preview','Test accessible-name selectors and Sharp entrypoint import','Mobile grid width clipping','Pause dependency tracking after async scene load'],
 blockers:[],artifacts,no_deployment:true,no_push_or_merge:true,shared_files_unchanged:true,test_server:'Playwright-managed localhost:3304 preview stopped; final ss inspection showed no listener',generated_at:new Date().toISOString()
};
await writeFile(root+'/.fleet-handoff.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({handoff:'.fleet-handoff.json',sha256:hash(await readFile(root+'/.fleet-handoff.json')),artifacts:artifacts.length,bundle},null,2));
