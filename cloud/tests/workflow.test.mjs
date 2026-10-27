import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {CloudStore,result,automaticExpected} from '../lib/store.mjs';
import {handle} from '../lib/api.mjs';
import vm from 'node:vm';
function fixture(){const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')))sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));const db={prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)},query,args}}}},async batch(items){sql.exec('BEGIN');try{const out=items.map(x=>sql.prepare(x.query).run(...x.args));sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};return{store:new CloudStore(db),db,sql}}
const manager={role:'manager',email:'owner@example.test'},ra={role:'ra',email:'ra@example.test'},other={role:'ra',email:'other@example.test'};
const row=(product=600000,email=ra.email,code='DEMO-1')=>({key:['Italia','Brescia',code].join('\u001f'),network:'Italia',site:'Brescia',code,ra:email,year:'2026',venduto:1000000,prodotto:product,fatturato:1100000,incassato:1100000,fullSal:true,partial:false,pMin:0,pMax:0});
test('V2 report retains mixed VAT, withholding, all categories and filters RA before pagination',async()=>{
 const original={};vm.runInNewContext(readFileSync(new URL('./fixtures/v2-engine.cjs',import.meta.url),'utf8'),original);
 const upgraded={};vm.runInNewContext(readFileSync(new URL('../public/assets/engine.js',import.meta.url),'utf8'),upgraded);
 const raw=upgraded.SALCore.store(),baseline=original.SALCore.store();
 const lines=[
 {CountryRete:'IT-Dirette',Sede:'Brescia',ResponsabileArea:ra.email,CodiceCommessa:'MIX',DataDelibera:'01/01/2023',macroarea:'NORD',StatoPratica:'In corso',Indirizzo:'Via Esempio 12, Brescia (dati fittizi)','Venduto€':1000,'ProdottoLordo€':200,'FatturatoTotale€':1100,'IncassatoTotale€':1100},
 {CountryRete:'IT-Dirette',Sede:'Brescia',ResponsabileArea:ra.email,CodiceCommessa:'MIX',DataDelibera:'01/01/2023',macroarea:'NORD',StatoPratica:'In corso',Indirizzo:'Via Esempio 12, Brescia (dati fittizi)','Venduto€':1000,'ProdottoLordo€':500,'FatturatoTotale€':1220,'IncassatoTotale€':1220},
 {CountryRete:'IT-Franchising',Sede:'Brescia 2',ResponsabileArea:ra.email,CodiceCommessa:'OTHER',DataDelibera:'01/01/2026',macroarea:'NORD','Venduto€':1000,'ProdottoLordo€':0,'FatturatoTotale€':0,'IncassatoTotale€':0},
 {CountryRete:'IT-Dirette',Sede:'Brescia',ResponsabileArea:ra.email,CodiceCommessa:'BANK',DataDelibera:'01/01/2023',macroarea:'NORD','Venduto€':1000,'ProdottoLordo€':0,'FatturatoTotale€':1220,'IncassatoTotale€':1140}
 ];for(const line of lines){raw.add(line);baseline.add(line)}
 const {store:s}=fixture();await publish(s,raw.finalize().rows);const page=await s.report(ra,{revision:await s.revision()});assert.equal(page.rows.length,3);assert.equal(page.rows.find(x=>x.code==='MIX').financeLines.length,2);assert.equal(page.rows.find(x=>x.code==='MIX').address,'Via Esempio 12, Brescia (dati fittizi)');
 const hydrated=upgraded.SALCore.store();page.rows.forEach(x=>hydrated.addGroup(x));const got=hydrated.finalize().rows.sort((a,b)=>a.code.localeCompare(b.code)),expected=baseline.finalize().rows.sort((a,b)=>a.code.localeCompare(b.code));
 for(let i=0;i<got.length;i++){for(const key of Object.keys(expected[i]))assert.deepEqual(JSON.parse(JSON.stringify(got[i][key])),JSON.parse(JSON.stringify(expected[i][key])),got[i].code+' '+key)}
 assert.equal(got.find(x=>x.code==='BANK').cashWithholdingRate,8);assert.equal(got.find(x=>x.code==='MIX').coefficient,'110% + 122%');
 assert.equal((await s.report(other,{revision:await s.revision()})).rows.length,0);
 const many=Array.from({length:501},(_,i)=>({...row(100000,ra.email,'P'+String(i).padStart(4,'0')),fullSal:false}));await publish(s,[...many,row(600000,other.email,'SECRET')]);const first=await s.report(ra,{revision:await s.revision()});assert.equal(first.rows.length,500);assert.ok(first.next);const second=await s.report(ra,{revision:await s.revision(),cursor:first.next});assert.equal(second.rows.length,1);assert.equal(second.next,null);assert.equal([...first.rows,...second.rows].some(x=>x.ra===other.email),false);assert.equal((await s.overview(ra,true)).cases.length,0);await assert.rejects(s.report(ra,{revision:'obsolete'}),e=>e.status===409);
});
async function publish(s,rows){const job=await s.startImport(manager,{source:'demo.csv',count:rows.length,baseRevision:await s.revision()});for(let i=0;i<rows.length;i+=500)await s.stage(manager,job.id,rows.slice(i,i+500));return s.commit(manager,job.id)}
test('SAL is calculated by the service; RA cannot enter or change the amount',async()=>{
 const {store:s}=fixture();await publish(s,[row()]);
 await assert.rejects(s.declare(ra,{key:row().key,version:0,status:'SAL da caricare',expected:100000,notes:''}),e=>e.status===400);
 let d=await s.declare(ra,{key:row().key,version:0,status:'SAL da caricare',notes:'Sì, da caricare'});assert.equal(d.promise.expected,400000);assert.equal(d.promise.automatic,true);
 await publish(s,[row(750000)]);d=await s.declare(ra,{key:d.key,version:1,status:'SAL da caricare',notes:'Confermato'});assert.equal(d.promise.expected,400000);assert.equal(d.promise.baseline,600000);
 const partial={...row(200000,ra.email,'PARTIAL'),fullSal:false,partial:true,fatturato:550000,incassato:550000,pMin:250820,pMax:350000};await publish(s,[partial]);
 await assert.rejects(s.declare(ra,{key:partial.key,version:0,status:'SAL da caricare',notes:''}),e=>e.status===400);
 await assert.rejects(s.declare(ra,{key:partial.key,version:0,status:'SAL da caricare',iva:'110%',expected:100,notes:''}),e=>e.status===400);
 const p=await s.declare(ra,{key:partial.key,version:0,status:'SAL da caricare',iva:'110%',notes:''});assert.equal(p.promise.expected,300000);assert.equal(p.promise.iva,'110%');
 assert.equal(automaticExpected(partial,'122%'),250820);assert.throws(()=>automaticExpected(partial,'999%'),e=>e.status===400);
});
test('recovering CSV addresses preserves financial revision, declarations and comparisons',async()=>{
 const {store:s}=fixture();const legacy=row();await publish(s,[legacy]);const revision=await s.revision();
 const declared=await s.declare(ra,{key:legacy.key,version:0,status:'SAL da caricare',notes:'Impegno originale'});
 const metadata={...legacy,address:'Via Esempio 12, Brescia (prova)',area:'NORD',state:'In corso',company:'DEMO',financeLines:[[1000000,1100000,600000,1100000]],oldDelibera:true,sameFinance:false,yearConflict:false};
 const job=await s.startImport(manager,{source:'originale.csv',count:1,baseRevision:revision});await s.stage(manager,job.id,[metadata]);
 await s.declare(ra,{key:legacy.key,version:1,status:'SAL da caricare',notes:'Nota aggiornata durante recupero'});
 await assert.rejects(s.completeMetadata(ra,job.id),e=>e.status===403);
 const done=await s.completeMetadata(manager,job.id);assert.equal(done.revision,revision);assert.equal(await s.revision(),revision);
 const overview=await s.overview(ra,true);assert.equal(overview.source.source,'CSV condiviso');assert.equal(overview.declarations[0].notes,'Nota aggiornata durante recupero');assert.deepEqual(overview.declarations[0].promise,declared.promise);assert.equal((await s.history(ra)).entries.length,2);
 const report=await s.report(ra,{revision,reportRevision:overview.reportRevision});assert.equal(report.rows[0].address,metadata.address);assert.equal(report.rows[0].prodotto,legacy.prodotto);assert.equal(report.rows[0].oldDelibera,true);assert.ok(Array.isArray(report.rows[0].financeLines));
 await assert.rejects(s.report(ra,{revision,reportRevision:revision+':'}),e=>e.status===409);
 const wrong=await s.startImport(manager,{source:'diverso.csv',count:1,baseRevision:revision});await s.stage(manager,wrong.id,[{...metadata,prodotto:700000,financeLines:[[1000000,1100000,700000,1100000]],address:'Non deve sostituire'}]);await assert.rejects(s.completeMetadata(manager,wrong.id),e=>e.status===409);
 assert.equal((await s.report(ra,{revision})).rows[0].address,metadata.address);assert.equal((await s.report(ra,{revision})).rows[0].prodotto,legacy.prodotto);assert.equal((await s.history(ra)).entries.length,2);
});
test('weekly comparisons, immutable baseline, closures and new cycles survive',async()=>{const {store:s}=fixture();await publish(s,[row(),row(600000,other.email,'OTHER')]);assert.equal((await s.overview(ra)).cases.length,1);assert.equal((await s.overview(other)).cases[0].code,'OTHER');const d=await s.declare(ra,{key:row().key,version:0,status:'SAL da caricare',expected:400000,notes:'Primo impegno'});assert.equal((await s.results(ra))[0].status,'In attesa del prossimo CSV');await publish(s,[row(750000),row(600000,other.email,'OTHER')]);let r=(await s.results(ra))[0];assert.equal(r.status,'Aumento parziale');assert.equal(r.delta,150000);assert.equal(r.remaining,250000);await assert.rejects(s.declare(ra,{key:d.key,version:1,status:'SAL da caricare',expected:100000}),e=>e.status===409);await s.declare(ra,{key:d.key,version:1,status:'SAL da caricare',expected:400000,notes:'Nota successiva'});await publish(s,[row(1000000)]);r=(await s.results(ra))[0];assert.equal(r.status,'Importo riscontrato');assert.equal(r.declaration.promise.baseline,600000);await s.archive(manager,d.key,2);await publish(s,[row(800000)]);const next=await s.declare(ra,{key:d.key,version:3,status:'SAL da caricare',expected:200000,notes:'Secondo ciclo'});assert.equal(next.promise.baseline,800000);const h=await s.history(ra);assert.equal(h.entries.filter(x=>x.event==='comparison').length,3);assert.equal(h.entries.find(x=>x.event==='comparison'&&x.data.delta===150000).data.declaration.notes,'Primo impegno');assert.equal((await s.history(other)).entries.length,0);const backup=[];for await(const x of s.backup(manager))backup.push(x);assert.equal(backup.at(-1).type,'complete');assert.equal(backup.some(x=>x.type==='sessions'),false)});
test('failed imports and stale concurrent saves roll back completely',async()=>{const {store:s}=fixture();await publish(s,[row()]);const revision=await s.revision(),job=await s.startImport(manager,{source:'bad.csv',count:2,baseRevision:revision});await s.stage(manager,job.id,[row()]);await assert.rejects(s.stage(manager,job.id,[row(700000)]));await assert.rejects(s.commit(manager,job.id),e=>e.status===409);assert.equal(await s.revision(),revision);const args={key:row().key,version:0,status:'SAL da caricare',expected:400000,notes:''};const saves=await Promise.allSettled([s.declare(ra,args),s.declare(ra,args)]);assert.equal(saves.filter(x=>x.status==='fulfilled').length,1);assert.equal((await s.history(ra)).entries.length,1);await assert.rejects(s.declare(other,{...args,version:1}),e=>e.status===403)});
test('missing or reassigned practice cannot appear as successfully checked',async()=>{const {store:s}=fixture();await publish(s,[row()]);await s.declare(ra,{key:row().key,version:0,status:'SAL da caricare',expected:400000,notes:''});await publish(s,[row(1000000,other.email)]);assert.equal((await s.results(ra))[0].status,'RA cambiato · verifica');assert.equal((await s.results(ra))[0].product,null);assert.equal((await s.overview(other)).cases[0].declaration,null);await publish(s,[row(600000,other.email,'NEW')]);assert.equal((await s.results(ra))[0].status,'Pratica non trovata nel CSV');const h=await s.history(ra);for(const entry of h.entries.filter(x=>x.event==='comparison'))assert.deepEqual(entry.data,result(entry.data.declaration,entry.data.status.startsWith('RA cambiato')?row(1000000,other.email):null,entry.data.revision))});
test('manager needs native identity on login and every request; RA APIs stay scoped',async()=>{const {store:s,db}=fixture();await publish(s,[row(),row(600000,other.email,'OTHER')]);const env={DB:db,SALCHECK_OWNER_EMAIL:manager.email},identity={userId:'owner-id',email:manager.email};const request=(path,body,token,who=null)=>handle(new Request('https://sal.test/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env,who);assert.equal((await request('session',{manager:true,email:manager.email})).status,403);const login=await (await request('session',{email:ra.email})).json();const overview=await (await request('overview',undefined,login.token)).json();assert.equal(overview.cases.length,1);assert.equal((await request('backup',undefined,login.token)).status,403);assert.equal((await request('imports',{count:1,source:'x',baseRevision:overview.revision},login.token)).status,403);const admin=await (await request('session',{manager:true},null,identity)).json();assert.ok(admin.token);assert.equal((await request('overview',undefined,admin.token)).status,403);assert.equal((await request('overview',undefined,admin.token,identity)).status,200)});

test('all five directors read the whole network and history but cannot mutate or export management backups',async()=>{
 const {store:s,db,sql}=fixture();await publish(s,[row(),row(600000,other.email,'OTHER')]);
 await s.declare(ra,{key:row().key,version:0,status:'SAL da caricare',notes:'Primo RA'});
 await s.declare(other,{key:row(600000,other.email,'OTHER').key,version:0,status:'SAL da caricare',notes:'Altro RA'});
 await publish(s,[row(750000),row(800000,other.email,'OTHER')]);
 const env={DB:db,SALCHECK_OWNER_EMAIL:manager.email};
 const req=(path,body,token)=>handle(new Request('https://sal.test/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env,null);
 const before=JSON.stringify(['current_rows','declarations','comparisons','imports','audit','state'].map(t=>sql.prepare('SELECT * FROM '+t).all()));
 for(const prefix of ['g.naso','j.rossi','r.pancani','s.muzio','g.digristina']){
  const email=prefix+'@acrobaticagroup.com',session=await (await req('session',{email:email.toUpperCase()})).json();assert.equal(session.user.role,'director');assert.equal(session.user.email,email);
  const overview=await (await req('overview',undefined,session.token)).json();assert.equal(overview.cases.length,2);assert.equal(overview.declarations.length,2);assert.equal(overview.followups.length,2);
  const report=await (await req('report?revision='+encodeURIComponent(overview.revision),undefined,session.token)).json();assert.equal(report.rows.length,2);assert.deepEqual(new Set(report.rows.map(r=>r.ra)),new Set([ra.email,other.email]));
  const history=await (await req('history',undefined,session.token)).json();assert.equal(history.entries.length,4);
  for(const [path,body] of [['declarations',{key:row().key,version:1,status:'Da escludere',notes:'NO'}],['archive',{key:row().key,version:1}],['imports',{source:'NO',count:1,baseRevision:overview.revision}],['imports/00000000-0000-0000-0000-000000000000/rows',{rows:[row()]}],['imports/00000000-0000-0000-0000-000000000000/commit',{}],['imports/00000000-0000-0000-0000-000000000000/metadata',{}]])assert.equal((await req(path,body,session.token)).status,403,path);
  assert.equal((await req('backup',undefined,session.token)).status,403);
  await assert.rejects(s.declare({role:'director',email},{key:row().key,version:1,status:'Da escludere',notes:''}),e=>e.status===403);
  assert.equal((await req('logout',{},session.token)).status,200);
 }
 assert.equal(JSON.stringify(['current_rows','declarations','comparisons','imports','audit','state'].map(t=>sql.prepare('SELECT * FROM '+t).all())),before);
 const unlisted=await (await req('session',{email:ra.email,role:'director',director:true})).json();assert.equal(unlisted.user.role,'ra');assert.equal((await (await req('overview',undefined,unlisted.token)).json()).cases.length,1);
});

test('V4 streams every RA-owned practice in one authenticated NDJSON response without exposing other RA data',async()=>{
 const {store:s,db}=fixture();
 const items=Array.from({length:1001},(_,i)=>row(600000,ra.email,'P'+String(i).padStart(5,'0')));
 items.push(row(600000,other.email,'PRIVATE'));
 await publish(s,items);
 const env={DB:db,SALCHECK_OWNER_EMAIL:manager.email};
 const req=(path,token)=>handle(new Request('https://sal.test/api/'+path,{
  headers:token?{Authorization:'Bearer '+token}:undefined
 }),env,null);
 const session=await (await handle(new Request('https://sal.test/api/session',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:ra.email})
 }),env,null)).json();
 const revision=await s.revision(),rev=revision+':'+await s.metadataRevision();
 const path='report-stream?revision='+encodeURIComponent(revision)+'&reportRevision='+encodeURIComponent(rev);
 assert.equal((await req(path,null)).status,401);
 assert.equal((await req('report-stream?revision=old&reportRevision=old',session.token)).status,409);
 const response=await req(path,session.token);
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
 const messages=(await response.text()).trim().split('\n').map(JSON.parse);
 const pages=messages.filter(x=>x.type==='page');
 assert.equal(pages.length,2);
 assert.equal(pages[0].rows.length,1000);
 assert.equal(pages[1].rows.length,1);
 assert.equal(messages.at(-1).type,'complete');
 const all=pages.flatMap(x=>x.rows);
 assert.equal(all.length,1001);
 assert.equal(new Set(all.map(x=>x.key)).size,1001);
 assert.ok(all.every(x=>x.ra===ra.email));
 assert.ok(all.every(x=>!x.code.includes('PRIVATE')));
 const direct=await s.report(ra,{revision,reportRevision:rev,limit:1000});
 assert.equal(direct.rows.length,1000);
 await assert.rejects(s.report(ra,{revision,reportRevision:rev,limit:5001}),e=>e.status===400);
});
test('V4 preserves published CSV and metadata log with director-only read access',async()=>{
 const {store:s,db}=fixture();
 await publish(s,[row()]);
 await publish(s,[row(650000)]);
 const managerLog=await s.importLog(manager);
 assert.equal(managerLog.items.length,2);
 assert.ok(managerLog.items[0].publishedAt);
 assert.ok(managerLog.items.every(x=>x.kind==='CSV Albert'));
 assert.ok(managerLog.items.every(x=>x.count===1));
 await assert.rejects(s.importLog(ra),e=>e.status===403);
 const env={DB:db,SALCHECK_OWNER_EMAIL:manager.email};
 const login=await handle(new Request('https://sal.test/api/session',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'g.naso@acrobaticagroup.com'})
 }),env,null);
 const director=(await login.json()).token;
 const res=await handle(new Request('https://sal.test/api/import-log',{
  headers:{Authorization:'Bearer '+director}
 }),env,null);
 assert.equal(res.status,200);
 const report=await res.json();
 assert.equal(report.items.length,2);
 const resident=await handle(new Request('https://sal.test/api/session',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:ra.email})
 }),env,null);
 const raToken=(await resident.json()).token;
 const denied=await handle(new Request('https://sal.test/api/import-log',{
  headers:{Authorization:'Bearer '+raToken}
 }),env,null);
 assert.equal(denied.status,403);
 assert.equal((await s.revision()).length>0,true);
});
test('V4 keeps the V2 report files and historical management screens',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const shell=readFileSync(new URL('../public/workspace.html',import.meta.url),'utf8');
 const report=readFileSync(new URL('../public/report-v2.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/report-v2.css',import.meta.url),'utf8');
 for(const label of ['/api/report-stream','/api/overview?summary=1','/api/declarations','/api/backup'])assert.ok(app.includes(label),label);
 for(const id of ['v2Report','entry','managerPanel','followupView','historyView','uploadsView'])assert.ok(shell.includes('id="'+id+'"'),id);
 for(const label of ['SALReport','renderAll()','renderDetails()','cashWithholdingRate'])assert.ok(report.includes(label),label);
 for(const label of ['.brand','.config','.metrics','.detail-table'])assert.ok(css.includes(label),label);
});

test('V4 fast dashboard reads exact published per-site baselines without loading every practice',async()=>{
 const {store:s,db,sql}=fixture();
 const first=row(600000,ra.email,'FAST-1');
 const second=row(800000,other.email,'FAST-2');
 const partial={...row(300000,ra.email,'FAST-3'),fullSal:false,partial:true,pMin:150000,pMax:350000};
 await publish(s,[first,second,partial]);
 const before=sql.prepare('SELECT COUNT(*) AS count FROM audit').get().count;
 const mine=await s.dashboard(ra);
 const whole=await s.dashboard(manager);
 const director=await s.dashboard({role:'director',email:'director@example.test'});
 assert.equal(mine.reportRevision,mine.revision+':'+await s.metadataRevision());
 assert.equal(mine.sites.length,1);
 assert.equal(mine.sites[0].practices,2);
 assert.equal(mine.sites[0].fullSal,400000);
 assert.equal(mine.sites[0].pMin,150000);
 assert.equal(mine.sites[0].pMax,350000);
 assert.equal(whole.sites[0].practices,3);
 assert.deepEqual(director.sites,whole.sites);
 assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM audit').get().count,before);
 const detail=await s.report(ra,{revision:mine.revision,reportRevision:mine.reportRevision,site:'Brescia',network:'Italia'});
 assert.equal(detail.rows.length,2);
 assert.ok(detail.rows.every(x=>x.ra===ra.email));
 assert.equal((await s.report(ra,{revision:mine.revision,site:'Non assegnata'})).rows.length,0);
 await assert.rejects(s.report(ra,{revision:mine.revision,site:'A'.repeat(256)}),x=>x.status===400);
 const session=await handle(new Request('https://sal.test/api/session',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:ra.email})
 }),{DB:db},null);
 const token=(await session.json()).token;
 const denied=await handle(new Request('https://sal.test/api/dashboard'),{DB:db},null);
 assert.equal(denied.status,401);
 const fast=await handle(new Request('https://sal.test/api/dashboard',{
  headers:{Authorization:'Bearer '+token}
 }),{DB:db},null);
 assert.equal(fast.status,200);
 assert.equal((await fast.json()).sites[0].practices,2);
 await publish(s,[row(550000,ra.email,'FAST-1')]);
 const updated=await s.dashboard(ra);
 assert.notEqual(updated.revision,mine.revision);
 assert.equal(updated.sites[0].practices,1);
 assert.equal(updated.sites[0].fullSal,450000);
});
test('V4 initial page uses DB dashboard; exact V2 full detail is opt-in or site-scoped',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/workspace.html',import.meta.url),'utf8');
 for(const needle of ["request('/api/dashboard')",'renderFastDashboard(fast)','if(!$(\'detailArea\').hidden)await loadReport();', "site:url.searchParams.get('site')"]){
  if(needle.startsWith('site:'))continue;
  assert.ok(app.includes(needle),needle);
 }
 for(const id of ['v4Dashboard','detailArea','fastPractices','fastSiteRows','fullDetail','closeDetail'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(app.includes("request('/api/dashboard')"));
 const refresh=app.slice(app.indexOf('async function refresh(){'),app.indexOf("$('entry').onsubmit",app.indexOf('async function refresh(){')));
 assert.ok(refresh.includes("if(!$('detailArea').hidden)await loadReport();"));
 assert.equal(refresh.split('\n').filter(line=>line.trim()==='await loadReport();').length,0);
});

test('V4 operational director: verified owner can read and update every RA, but cannot import or backup',async()=>{
 const {store:s,db,sql}=fixture();
 const own=row(600000,ra.email,'OWN');
 const foreign=row(700000,other.email,'FOREIGN');
 await publish(s,[own,foreign]);
 const env={DB:db,SALCHECK_OWNER_EMAIL:manager.email};
 const identity={userId:'owner-stable-id',email:manager.email};
 const req=(path,body,token,who=null)=>handle(new Request('https://sal.test/api/'+path,{
  method:body===undefined?'GET':'POST',
  headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),
   ...(token?{Authorization:'Bearer '+token}:{})},
  body:body===undefined?undefined:JSON.stringify(body)
 }),env,who);
 // A user who knows the owner email must never acquire nationwide write access.
 assert.equal((await req('session',{operational:true,email:manager.email})).status,403);
 const ordinary=await (await req('session',{email:manager.email})).json();
 assert.equal(ordinary.user.role,'ra');
 const ordinaryData=await (await req('overview',undefined,ordinary.token)).json();
 assert.equal(ordinaryData.sites.length,0);
 assert.equal((await req('declarations',{key:foreign.key,version:0,status:'SAL da caricare',notes:'No'},ordinary.token)).status,403);
 const session=await (await req('session',{operational:true},null,identity)).json();
 assert.equal(session.user.role,'operational_director');
 assert.equal(session.user.email,manager.email);
 // Native identity must be validated on every request, not just at session creation.
 assert.equal((await req('dashboard',undefined,session.token)).status,403);
 assert.equal((await req('dashboard',undefined,session.token,{userId:'impostor',email:manager.email})).status,403);
 const all=await (await req('dashboard',undefined,session.token,identity)).json();
 assert.equal(all.sites[0].practices,2);
 const report=await (await req('report?revision='+encodeURIComponent(all.revision),undefined,session.token,identity)).json();
 assert.equal(report.rows.length,2);
 const edited=await req('declarations',{key:foreign.key,version:0,status:'SAL da caricare',notes:'Verificata dalla direzione'},session.token,identity);
 assert.equal(edited.status,200);
 const record=await edited.json();
 assert.equal(record.ra,other.email);
 assert.equal(record.actor,manager.email);
 assert.equal(record.promise.expected,300000);
 const visible=await (await req('overview',undefined,session.token,identity)).json();
 assert.equal(visible.declarations.length,1);
 assert.equal(visible.declarations[0].ra,other.email);
 assert.equal((await req('archive',{key:foreign.key,version:record.version},session.token,identity)).status,200);
 const history=await (await req('history',undefined,session.token,identity)).json();
 assert.ok(history.entries.some(x=>x.event==='archive'));
 assert.equal((await req('imports',{source:'no.csv',count:1,baseRevision:all.revision},session.token,identity)).status,403);
 assert.equal((await req('backup',undefined,session.token,identity)).status,403);
 const importLog=await req('import-log',undefined,session.token,identity);
 assert.equal(importLog.status,200);
 assert.ok((await importLog.json()).items.length>=1);
 assert.equal((await s.revision()),all.revision);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM current_rows').get().n,2);
});
test('V4 verified operational direction route is distinct from email-only direction and CSV management',()=>{
 const access=readFileSync(new URL('../lib/access.mjs',import.meta.url),'utf8');
 const api=readFileSync(new URL('../lib/api.mjs',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/workspace.html',import.meta.url),'utf8');
 const route=readFileSync(new URL('../app/direzione/page.tsx',import.meta.url),'utf8');
 assert.ok(access.includes("user.role==='operational_director'"));
 assert.ok(api.includes("privileged?identity.userId:null"));
 assert.ok(api.includes("user.role==='manager'||user.role==='operational_director'"));
 assert.ok(app.includes("data.user.role==='operational_director'"));
 assert.ok(html.includes('href="/direzione"'));
 assert.ok(route.includes("requireChatGPTUser('/direzione')"));
 assert.ok(route.includes("redirect('/workspace.html?direzione=1')"));
});
