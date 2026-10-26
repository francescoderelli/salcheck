import {CloudStore,ServiceError,fail,text} from './store.mjs';
const emailOf=x=>{if(typeof x!=='string'||x.length>255||!/^\S+@\S+\.\S+$/.test(x.trim()))fail(400,'Inserisci un’email valida.');return x.trim().toLowerCase()};
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
export async function handle(request,env,identity){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 const json=(value,status=200)=>Response.json(value,{status,headers});
 try{
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!env.DB)fail(503,'Archivio condiviso non disponibile.');
  const store=new CloudStore(env.DB.withSession?env.DB.withSession('first-primary'):env.DB);
  if(path==='/api/config'&&method==='GET')return json({ready:Boolean(env.SALCHECK_OWNER_EMAIL),access:'email dichiarata'});
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)fail(403,'Origine non abilitata.');
  let body;
  if(method==='POST'){
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))fail(415,'Formato richiesta non valido.');
   const raw=await request.text();if(raw.length>2*1024*1024)fail(413,'Blocco troppo grande.');
   try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{fail(400,'Richiesta non leggibile.')}
  }
  async function owner(){
   if(!identity?.userId||identity.email?.toLowerCase()!==env.SALCHECK_OWNER_EMAIL?.toLowerCase())fail(403,'La gestione è riservata al proprietario del sito.');
   await store.q("INSERT OR IGNORE INTO state VALUES('owner_id',?)",identity.userId).run();
   if((await store.first("SELECT value FROM state WHERE key='owner_id'"))?.value!==identity.userId)fail(403,'Accesso gestione non valido.');
  }
  if(path==='/api/session'&&method==='POST'){
   const manager=body.manager===true;if(manager)await owner();
   const email=manager?identity.email.toLowerCase():emailOf(body.email),token=crypto.randomUUID()+crypto.randomUUID();
   await store.q('DELETE FROM sessions WHERE expires<?',Date.now()).run();
   await store.q('INSERT INTO sessions VALUES(?,?,?,?,?)',await hash(token),email,manager?'manager':'ra',manager?identity.userId:null,Date.now()+8*3600000).run();
   return json({token,user:{email,role:manager?'manager':'ra'}});
  }
  const token=/^Bearer ([a-zA-Z0-9-]+)$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)fail(401,'Inserisci di nuovo la tua email.');
  const user=await store.first('SELECT * FROM sessions WHERE hash=? AND expires>?',await hash(token),Date.now());
  if(!user)fail(401,'Sessione scaduta. Accedi di nuovo.');
  if(user.role==='manager'){await owner();if(user.owner_id!==identity.userId)fail(403,'Sessione gestione non valida.')}
  if(path==='/api/logout'&&method==='POST'){await store.q('DELETE FROM sessions WHERE hash=?',user.hash).run();return json({ok:true})}
  if(method==='GET'){
   if(path==='/api/overview')return json(await store.overview(user,url.searchParams.get('summary')==='1'));
   if(path==='/api/report')return json(await store.report(user,{cursor:url.searchParams.get('cursor')||'',revision:url.searchParams.get('revision')||'',reportRevision:url.searchParams.get('reportRevision')||undefined}));
   if(path==='/api/history'){const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail(400,'Pagina non valida.');return json(await store.history(user,offset))}
   if(path==='/api/backup'){
    store.manager(user);const iterator=store.backup(user),encoder=new TextEncoder();
    const stream=new ReadableStream({async pull(controller){try{const item=await iterator.next();if(item.done)controller.close();else controller.enqueue(encoder.encode(JSON.stringify(item.value)+'\n'))}catch(e){controller.error(e)}},async cancel(){await iterator.return()}});
    return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="SALCheck-storico.jsonl"'}});
   }
  }
  if(method==='POST'){
   if(path==='/api/imports')return json(await store.startImport(user,body),201);
   const match=/^\/api\/imports\/([a-f0-9-]{36})\/(rows|commit|metadata)$/.exec(path);
   if(match)return json(match[2]==='rows'?await store.stage(user,match[1],body.rows):match[2]==='metadata'?await store.completeMetadata(user,match[1]):await store.commit(user,match[1]));
   if(path==='/api/declarations')return json(await store.declare(user,body));
   if(path==='/api/archive')return json(await store.archive(user,body.key,body.version));
  }
  fail(404,'Funzione non disponibile.');
 }catch(e){return json({error:e instanceof ServiceError?e.message:'Operazione non riuscita. Riprova.'},e instanceof ServiceError?e.status:500)}
}
