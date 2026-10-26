'use strict';
const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const GUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
class ServiceError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new ServiceError(status,message)};
const OUTCOMES=['Da verificare','SAL da caricare','Già registrato','Lavoro non eseguito','Acconto','Da approfondire','Da escludere'];
const text=(x,max=255)=>{if(typeof x!=='string'||x.length>max)fail(400,'Testo non valido.');return x.trim()};
const money=(x,nullable=false)=>{if(nullable&&x===null)return null;if(!Number.isSafeInteger(x)||Math.abs(x)>1e14)fail(400,'Importo non valido.');return x};
function cleanRow(r){
 const network=text(r.network),site=text(r.site),code=text(r.code),ra=text(r.ra).toLowerCase(),key=network+'\u001f'+site+'\u001f'+code;
 if(!network||!site||!code||r.key!==key)fail(400,'Identificativo pratica non coerente.');
 const out={key,network,site,code,ra,year:text(r.year||'',10),address:text(r.address||'',1000)};
 for(const k of ['venduto','prodotto','fatturato','incassato'])out[k]=money(r[k]);
 if(out.venduto<=0)fail(400,'Pratica senza venduto positivo.');
 out.fullSal=r.fullSal===true;out.partial=r.partial===true;
 out.remaining=out.venduto-out.prodotto;
 out.pMin=money(r.pMin||0);out.pMax=money(r.pMax||0);
 return out;
}
class Store{
 constructor(filename,admins){
  this.admins=new Set(admins);this.db=new DatabaseSync(filename);
  this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS accounts(oid TEXT PRIMARY KEY,email TEXT NOT NULL,seen_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS assignments(oid TEXT NOT NULL,ra TEXT NOT NULL,PRIMARY KEY(oid,ra));
   CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,source TEXT NOT NULL,owner TEXT NOT NULL,created_at TEXT NOT NULL,committed_at TEXT,expected INTEGER NOT NULL,base_revision TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS staged(import_id TEXT NOT NULL,key TEXT NOT NULL,ra TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(import_id,key),FOREIGN KEY(import_id) REFERENCES imports(id));
   CREATE TABLE IF NOT EXISTS current_rows(key TEXT PRIMARY KEY,ra TEXT NOT NULL,data TEXT NOT NULL,import_id TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS current_ra ON current_rows(ra);
   CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   INSERT OR IGNORE INTO state VALUES('revision','');
   CREATE TABLE IF NOT EXISTS declarations(key TEXT PRIMARY KEY,ra TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS declaration_ra ON declarations(ra);
   CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,record_key TEXT NOT NULL,data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS comparisons(import_id TEXT NOT NULL,key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(import_id,key));`);
 }
 close(){this.db.close()}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result}catch(e){this.db.exec('ROLLBACK');throw e}}
 log(actor,event,key,data){this.db.prepare('INSERT INTO audit(at,actor,event,record_key,data) VALUES(?,?,?,?,?)').run(new Date().toISOString(),actor,event,key,JSON.stringify(data))}
 revision(){return this.db.prepare("SELECT value FROM state WHERE key='revision'").get().value}
 user(identity){
  if(!GUID.test(identity?.oid))fail(401,'Accesso non valido.');
  this.db.prepare('INSERT INTO accounts VALUES(?,?,?) ON CONFLICT(oid) DO UPDATE SET email=excluded.email,seen_at=excluded.seen_at').run(identity.oid,text(identity.email||''),new Date().toISOString());
  const ras=this.db.prepare('SELECT ra FROM assignments WHERE oid=? ORDER BY ra').all(identity.oid).map(x=>x.ra);
  return {...identity,role:this.admins.has(identity.oid)?'manager':'ra',ras:this.admins.has(identity.oid)?ras:[text(identity.email||'').toLowerCase()]};
 }
 manager(user){if(user.role!=='manager'||!this.admins.has(user.oid))fail(403,'Operazione riservata al responsabile.');}
 can(user,ra){return user.role==='manager'&&this.admins.has(user.oid)||user.ras.includes(ra)}
 assignments(user){this.manager(user);return {accounts:this.db.prepare('SELECT * FROM accounts ORDER BY email').all(),assignments:this.db.prepare('SELECT * FROM assignments ORDER BY oid,ra').all(),ras:this.db.prepare('SELECT DISTINCT ra FROM current_rows ORDER BY ra').all().map(x=>x.ra).filter(x=>x&&!['RA non indicato','RA da verificare'].includes(x))}}
 setAssignments(user,oid,ras){
  this.manager(user);if(!GUID.test(oid)||!this.db.prepare('SELECT 1 FROM accounts WHERE oid=?').get(oid))fail(400,'L’utente deve prima accedere al sito.');
  if(!Array.isArray(ras)||ras.length>100)fail(400,'Assegnazioni non valide.');
  const valid=new Set(this.assignments(user).ras),unique=[...new Set(ras.map(x=>text(x)))];
  if(unique.some(x=>!valid.has(x)))fail(400,'RA non presente nel CSV pubblicato.');
  this.tx(()=>{this.db.prepare('DELETE FROM assignments WHERE oid=?').run(oid);for(const ra of unique)this.db.prepare('INSERT INTO assignments VALUES(?,?)').run(oid,ra);this.log(user.oid,'assignments',oid,unique)});
 }
 startImport(user,{source,count,baseRevision}){
  this.manager(user);if(!Number.isInteger(count)||count<1||count>1000000)fail(400,'Numero pratiche non valido.');
  if(baseRevision!==this.revision())fail(409,'Un altro responsabile ha pubblicato un CSV: aggiorna la pagina.');
  const id=randomUUID();this.db.prepare('INSERT INTO imports(id,source,owner,created_at,expected,base_revision) VALUES(?,?,?,?,?,?)').run(id,text(source),user.oid,new Date().toISOString(),count,baseRevision);return {id};
 }
 job(user,id){this.manager(user);const job=this.db.prepare('SELECT * FROM imports WHERE id=?').get(id);if(!job||job.owner!==user.oid||job.committed_at)fail(409,'Importazione non disponibile.');return job}
 stage(user,id,rows){
  const job=this.job(user,id);if(!Array.isArray(rows)||!rows.length||rows.length>500)fail(400,'Inviare da 1 a 500 pratiche per blocco.');
  const clean=rows.map(cleanRow);
  this.tx(()=>{
   for(const r of clean){const prior=this.db.prepare('SELECT data FROM staged WHERE import_id=? AND key=?').get(id,r.key),data=JSON.stringify(r);
    if(prior&&prior.data!==data)fail(409,'Pratica ripetuta con dati diversi.');
    this.db.prepare('INSERT OR IGNORE INTO staged VALUES(?,?,?,?)').run(id,r.key,r.ra,data);
   }
   if(this.db.prepare('SELECT COUNT(*) AS n FROM staged WHERE import_id=?').get(id).n>job.expected)fail(400,'Troppe pratiche nell’importazione.');
  });
 }
 commit(user,id){
  return this.tx(()=>{
   const job=this.job(user,id);
   if(job.base_revision!==this.revision())fail(409,'È stato pubblicato un altro CSV: ripeti l’importazione.');
   if(this.db.prepare('SELECT COUNT(*) AS n FROM staged WHERE import_id=?').get(id).n!==job.expected)fail(409,'Importazione incompleta: il CSV precedente resta attivo.');
   this.db.prepare('DELETE FROM current_rows').run();
   this.db.prepare('INSERT INTO current_rows SELECT key,ra,data,import_id FROM staged WHERE import_id=?').run(id);
   this.db.prepare("UPDATE state SET value=? WHERE key='revision'").run(id);
   this.db.prepare('UPDATE imports SET committed_at=? WHERE id=?').run(new Date().toISOString(),id);
   for(const r of this.results(user))this.db.prepare('INSERT INTO comparisons VALUES(?,?,?)').run(id,r.declaration.key,JSON.stringify(r));
   this.log(user.oid,'csv_published',id,{source:job.source,count:job.expected});return {revision:id,count:job.expected};
  });
 }
 rows(user){
  const rows=user.role==='manager'?this.db.prepare('SELECT data FROM current_rows').all():user.ras.flatMap(ra=>this.db.prepare('SELECT data FROM current_rows WHERE ra=?').all(ra));
  const declarations=new Map(this.declarations(user).map(x=>[x.key,x]));
  return rows.map(x=>JSON.parse(x.data)).filter(r=>r.fullSal||r.partial||declarations.has(r.key)).map(r=>({...r,declaration:declarations.get(r.key)||null}));
 }
 declarations(user){
  const rows=user.role==='manager'?this.db.prepare('SELECT data,version FROM declarations').all():user.ras.flatMap(ra=>this.db.prepare('SELECT data,version FROM declarations WHERE ra=?').all(ra));
  return rows.map(x=>({...JSON.parse(x.data),version:x.version}));
 }
 declare(user,input){
  return this.tx(()=>{
   const key=text(input.key,800),stored=this.db.prepare('SELECT * FROM declarations WHERE key=?').get(key),current=this.db.prepare('SELECT * FROM current_rows WHERE key=?').get(key);
   const row=current?JSON.parse(current.data):null,previous=stored?JSON.parse(stored.data):null;
   if(!row||!this.can(user,row.ra)||previous&&!this.can(user,previous.ra))fail(403,'Pratica non assegnata o non più disponibile.');
   if((stored?.version||0)!==input.version)fail(409,'La dichiarazione è stata modificata: ricarica prima di salvare.');
   const status=text(input.status,40);if(!OUTCOMES.includes(status))fail(400,'Esito non ammesso.');
   const notes=text(input.notes||'',1400),version=(stored?.version||0)+1;
   let promise=previous?.promise||null;
   if(status==='SAL da caricare'){
    if(!promise||promise.closedAt){
     if(!row.fullSal&&!row.partial)fail(400,'La pratica non presenta più SAL potenziale.');
     const expected=input.expected===null?(row.fullSal?row.remaining:row.pMin===row.pMax?row.pMax:null):money(input.expected);
     if(expected===null||expected<=0||expected>1e12||expected>row.remaining)fail(400,'Indica un SAL positivo non superiore al residuo venduto meno prodotto.');
     promise={baseline:row.prodotto,expected,importId:current.import_id,at:new Date().toISOString(),actor:user.oid};
    }
    if(previous?.promise&&!previous.promise.closedAt&&input.expected!==null&&input.expected!==undefined&&input.expected!==previous.promise.expected)fail(409,'Questo impegno ha già un importo salvato. Il responsabile può chiuderlo prima di aprirne uno nuovo.');
    // Repeated saves preserve the first declaration and baseline.
   }
   const declaration={key,ra:previous?.promise&&!previous.promise.closedAt?previous.ra:row.ra,site:row.site,code:row.code,network:row.network,status,notes,promise,updatedAt:new Date().toISOString(),actor:user.oid};
   this.db.prepare('INSERT INTO declarations VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET ra=excluded.ra,data=excluded.data,version=excluded.version').run(key,declaration.ra,JSON.stringify(declaration),version);
   this.log(user.oid,'declaration',key,{...declaration,version});return {...declaration,version};
  });
 }
 archive(user,key,version){
  this.manager(user);return this.tx(()=>{const prior=this.db.prepare('SELECT * FROM declarations WHERE key=?').get(text(key,800));
   if(!prior||prior.version!==version)fail(409,'Dichiarazione cambiata: aggiorna prima di archiviare.');
   const d=JSON.parse(prior.data);if(!d.promise||d.promise.closedAt)fail(409,'Nessun controllo aperto.');
   const result=this.results(user).find(x=>x.declaration.key===key);
   d.promise.closedAt=new Date().toISOString();d.promise.closure={product:result.product,delta:result.delta,remaining:result.remaining,status:result.status};
   this.db.prepare('UPDATE declarations SET data=?,version=version+1 WHERE key=?').run(JSON.stringify(d),key);this.log(user.oid,'archive',key,d);
  });
 }
 results(user){return this.declarations(user).filter(d=>d.promise).map(d=>{
  const item=this.db.prepare('SELECT data FROM current_rows WHERE key=?').get(d.key),current=item?JSON.parse(item.data):null;
  let status,delta=null,remaining=null,product=null;
  if(d.promise.closedAt){status='Archiviato';({product=null,delta=null,remaining=null}=d.promise.closure||{});}
  else if(!current)status='Pratica non trovata nel CSV';
  else if(current.ra!==d.ra)status='RA cambiato · verifica';
  else if(d.promise.importId===this.revision())status='In attesa del prossimo CSV';
  else{product=current.prodotto;delta=product-d.promise.baseline;remaining=Math.max(0,d.promise.expected-delta);status=delta<0?'Prodotto diminuito · verifica':delta>0&&remaining<=2?'Importo riscontrato':delta>0?'Aumento parziale':'Nessun aumento';if(status==='Importo riscontrato')remaining=0;}
  return {declaration:d,status,product,delta,remaining,revision:this.revision()};
 })}
 history(user,offset=0){
  const clause=user.role==='manager'?'1=1':"json_extract(a.data,'$.ra')=?";
  const comparisonClause=user.role==='manager'?'1=1':"json_extract(c.data,'$.declaration.ra')=?";
  const params=user.role==='manager'?[]:[user.email,user.email];
  const found=this.db.prepare(`SELECT * FROM (
   SELECT a.at,a.id AS sequence,a.event,a.record_key AS recordKey,a.data,COALESCE(u.email,'') AS actorEmail,'' AS source
   FROM audit a LEFT JOIN accounts u ON u.oid=a.actor WHERE a.event IN ('declaration','archive') AND ${clause}
   UNION ALL
   SELECT i.committed_at AS at,c.rowid AS sequence,'comparison' AS event,c.key AS recordKey,c.data,'' AS actorEmail,i.source
   FROM comparisons c JOIN imports i ON i.id=c.import_id WHERE ${comparisonClause}
  ) ORDER BY at DESC,event,sequence DESC LIMIT 101 OFFSET ?`).all(...params,offset);
  return {entries:found.slice(0,100).map(x=>({...x,data:JSON.parse(x.data),source:user.role==='manager'?x.source:(x.source?'CSV settimanale':'')})),hasMore:found.length>100,offset};
 }
 overview(user){const cases=this.rows(user),source=this.db.prepare('SELECT source,committed_at AS publishedAt,expected AS count FROM imports WHERE id=?').get(this.revision())||null;if(source&&user.role!=='manager'){source.source='CSV condiviso';source.count=cases.length}const sql="SELECT DISTINCT json_extract(data,'$.site') AS site FROM current_rows";const sites=(user.role==='manager'?this.db.prepare(sql+' ORDER BY site').all():this.db.prepare(sql+' WHERE ra=? ORDER BY site').all(user.email)).map(x=>x.site);return {user:{email:user.email,role:user.role},revision:this.revision(),source,sites,cases,followups:this.results(user)}}
}
module.exports={Store,ServiceError,OUTCOMES,cleanRow};
