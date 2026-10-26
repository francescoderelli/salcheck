'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../store.cjs'),{createServer,idFor}=require('../server.cjs');
const adminEmail='gestore@example.test',emailA='ra.a@example.test',emailB='ra.b@example.test',password='password-test-solo-fixture';
const identity=email=>({oid:idFor(email),email});
function row(site,ra,produced=600000,code='TEST-1'){return {key:'Diretta\u001f'+site+'\u001f'+code,network:'Diretta',site,code,ra,venduto:1000000,prodotto:produced,fatturato:1100000,incassato:1100000,fullSal:produced<1000000,partial:false};}
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'salcheck-v5-')),file=path.join(dir,'history.sqlite');let store=new Store(file,[idFor(adminEmail)]);t.after(()=>{try{store.close()}catch{}fs.unlinkSync(file);fs.rmdirSync(dir)});return {get store(){return store},reopen(){store.close();store=new Store(file,[idFor(adminEmail)]);return store}};}
function publish(store,rows,name='settimana.csv'){const user=store.user(identity(adminEmail)),job=store.startImport(user,{source:name,count:rows.length,baseRevision:store.revision()});store.stage(user,job.id,rows);store.commit(user,job.id);return job.id;}
test('tre CSV, chiusura e nuovo impegno: lo storico conserva il primo baseline anche dopo riavvio',t=>{
 const s=setup(t);publish(s.store,[row('SEDE A',emailA),row('SEDE B',emailB)]);
 const a=s.store.user(identity(emailA)),manager=s.store.user(identity(adminEmail)),key=row('SEDE A',emailA).key;
 const d=s.store.declare(a,{key,status:'SAL da caricare',expected:400000,version:0,notes:'Carico entro la settimana'});
 assert.equal(s.store.results(a)[0].status,'In attesa del prossimo CSV');
 publish(s.store,[row('SEDE A',emailA,750000),row('SEDE B',emailB)],'settimana-2.csv');
 assert.equal(s.store.results(a)[0].remaining,250000);assert.equal(s.store.results(a)[0].status,'Aumento parziale');
 publish(s.store,[row('SEDE A',emailA,1000000),row('SEDE B',emailB)],'settimana-3.csv');
 assert.equal(s.store.results(a)[0].status,'Importo riscontrato');assert.equal(s.store.results(a)[0].declaration.promise.baseline,600000);
 s.store.archive(manager,key,d.version);
 publish(s.store,[row('SEDE A',emailA,800000),row('SEDE B',emailB)],'settimana-4.csv');
 s.store.declare(a,{key,status:'SAL da caricare',expected:200000,version:2,notes:'Nuovo ciclo'});
 const h=s.reopen().history(a).entries;
 const original=h.find(x=>x.event==='declaration'&&x.data.promise.expected===400000);assert.equal(original.data.promise.baseline,600000);
 assert.equal(h.filter(x=>x.event==='comparison').length,3);assert.equal(h.filter(x=>x.event==='declaration').length,2);assert(h.some(x=>x.event==='archive'));
 assert(h.some(x=>x.event==='comparison'&&x.data.status==='Importo riscontrato'&&x.data.delta===400000));
});
test('salvataggi ripetuti e status diversi non spostano il primo impegno; modifiche concorrenti respinte',t=>{
 const {store}=setup(t);publish(store,[row('SEDE A',emailA)]);const a=store.user(identity(emailA)),key=row('SEDE A',emailA).key;
 store.declare(a,{key,status:'SAL da caricare',expected:400000,version:0});publish(store,[row('SEDE A',emailA,700000)]);
 assert.throws(()=>store.declare(a,{key,status:'SAL da caricare',expected:300000,version:1}),e=>e.status===409);
 store.declare(a,{key,status:'Da approfondire',expected:null,version:1});
 assert.equal(store.results(a)[0].declaration.promise.baseline,600000);assert.equal(store.results(a)[0].declaration.promise.expected,400000);
 assert.throws(()=>store.declare(a,{key,status:'Già registrato',expected:null,version:1}),e=>e.status===409);
});
test('importazione incompleta non sostituisce il CSV e una commessa assente non diventa confermata',t=>{
 const {store}=setup(t);publish(store,[row('SEDE A',emailA)]);const a=store.user(identity(emailA)),m=store.user(identity(adminEmail));
 store.declare(a,{key:row('SEDE A',emailA).key,status:'SAL da caricare',expected:400000,version:0});
 const before=store.revision(),job=store.startImport(m,{source:'incompleto.csv',count:2,baseRevision:before});store.stage(m,job.id,[row('SEDE B',emailB)]);assert.throws(()=>store.commit(m,job.id),e=>e.status===409);assert.equal(store.revision(),before);
 publish(store,[row('SEDE B',emailB)]);assert.equal(store.results(a)[0].status,'Pratica non trovata nel CSV');
});
test('HTTP: sessioni per email, query e storico limitati al RA; amministrazione protetta',async t=>{
 const {store}=setup(t);publish(store,[row('SEDE A',emailA),row('SEDE B',emailB)]);
 const b=store.user(identity(emailB));store.declare(b,{key:row('SEDE B',emailB).key,status:'SAL da caricare',expected:400000,version:0,notes:'SOLO B'});
 publish(store,[row('SEDE A',emailA),row('SEDE B',emailB,900000)]);
 const server=createServer({store,managerEmail:adminEmail,managerPassword:password,origins:['https://esempio.github.io']});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(route,body,token){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
 const a=await call('/api/session',{email:' RA.A@example.test ',role:'manager'});assert.equal(a.status,200);assert.equal(a.data.user.role,'ra');const token=a.data.token;
 const overview=await call('/api/overview?email='+emailB,undefined,token);assert.deepEqual(overview.data.sites,['SEDE A']);assert(overview.data.cases.every(x=>x.ra===emailA));assert(!JSON.stringify(overview).includes('SEDE B'));
 const h=await call('/api/history',undefined,token);assert.equal(h.data.entries.length,0);assert(!JSON.stringify(h).includes('SOLO B'));
 assert.equal((await call('/api/declarations',{key:row('SEDE B',emailB).key,status:'SAL da caricare',expected:400000,version:1},token)).status,403);
 assert.equal((await call('/api/imports',{source:'fake.csv',count:1,baseRevision:store.revision()},token)).status,403);
 assert.equal((await call('/api/session',{email:adminEmail})).status,403);assert.equal((await call('/api/session',{email:adminEmail,manager:true,password:'errata'})).status,401);
 const manager=await call('/api/session',{email:adminEmail,manager:true,password});assert.equal(manager.status,200);assert.equal((await call('/api/history',undefined,manager.data.token)).data.entries.length,2);
 const unknown=await call('/api/session',{email:'nessuno@example.test'});assert.equal((await call('/api/overview',undefined,unknown.data.token)).data.cases.length,0);
 const cors=await fetch(base+'/api/overview',{headers:{Origin:'https://altro.example',Authorization:'Bearer '+token}});assert.equal(cors.status,403);
 assert.equal((await call('/api/logout',{},token)).status,200);assert.equal((await call('/api/overview',undefined,token)).status,401);
});
