'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {Store,ServiceError}=require('./store.cjs');
const idFor=email=>{const s=createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0,32);return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20)};
const emailOf=value=>{if(typeof value!=='string'||value.length>255||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw new ServiceError(400,'Inserisci un’email valida.');return value.trim().toLowerCase()};
function createServer({store,managerEmail,managerPassword,origins=[],now=Date.now}){
 const sessions=new Map(),attempts=new Map(),ROOT=path.join(__dirname,'public'),ASSETS=path.join(__dirname,'assets');
 const passwordMatches=x=>typeof x==='string'&&managerPassword.length>=16&&timingSafeEqual(createHash('sha256').update(x).digest(),createHash('sha256').update(managerPassword).digest());
 return http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https:; worker-src 'self' blob:; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"};
  const origin=req.headers.origin;
  if(origin&&origins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';headers['Access-Control-Allow-Headers']='Content-Type,Authorization';headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS';}
  const json=(code,value)=>res.writeHead(code,{...headers,'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='OPTIONS'){res.writeHead(origin&&origins.includes(origin)?204:403,headers).end();return;}
   if(url.pathname==='/api/config'&&req.method==='GET'){json(200,{ready:Boolean(managerEmail&&managerPassword.length>=16),access:'email dichiarata'});return;}
   if(url.pathname.startsWith('/api/')){
    if(origin&&!origins.includes(origin))throw new ServiceError(403,'Origine del sito non abilitata.');
    let body;
    if(req.method==='POST'){
     if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ServiceError(415,'Formato richiesta non valido.');
     const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw new ServiceError(413,'Blocco troppo grande.');chunks.push(chunk)}
     try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{throw new ServiceError(400,'Richiesta non leggibile.');}
    }
    if(req.method==='POST'&&url.pathname==='/api/session'){
     const email=emailOf(body.email),manager=body.manager===true;
     if(manager){
      const ip=req.socket.remoteAddress,prior=attempts.get(ip);if(prior&&prior.until>now()&&prior.count>=10)throw new ServiceError(429,'Troppi tentativi. Riprova tra qualche minuto.');
      if(email!==managerEmail||!passwordMatches(body.password)){const x=prior&&prior.until>now()?prior:{count:0,until:now()+600000};x.count++;attempts.set(ip,x);throw new ServiceError(401,'Accesso gestione non valido.');}
      attempts.delete(ip);
     }else if(email===managerEmail)throw new ServiceError(403,'Per la gestione CSV usa l’accesso responsabile.');
     const token=randomBytes(32).toString('base64url');
     for(const [key,x] of sessions)if(x.expires<=now())sessions.delete(key);
     if(sessions.size>=5000)throw new ServiceError(503,'Servizio occupato. Riprova.');
     sessions.set(token,{identity:{oid:idFor(email),email},expires:now()+8*3600000});
     const user=store.user({oid:idFor(email),email});json(200,{token,user:{email:user.email,role:user.role}});return;
    }
    const token=/^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization||'')?.[1],session=sessions.get(token);
    if(!session||session.expires<=now()){if(token)sessions.delete(token);throw new ServiceError(401,'Inserisci di nuovo la tua email.');}
    const user=store.user(session.identity);
    if(req.method==='POST'&&url.pathname==='/api/logout'){sessions.delete(token);json(200,{ok:true});return;}
    if(req.method==='GET'&&url.pathname==='/api/overview'){json(200,store.overview(user));return;}
    if(req.method==='GET'&&url.pathname==='/api/history'){
     const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new ServiceError(400,'Pagina non valida.');
     json(200,store.history(user,offset));return;
    }
    if(req.method!=='POST')throw new ServiceError(405,'Operazione non supportata.');
    if(url.pathname==='/api/imports'){json(201,store.startImport(user,body));return;}
    const match=/^\/api\/imports\/([a-f0-9-]{36})\/(rows|commit)$/.exec(url.pathname);
    if(match){json(200,match[2]==='rows'?(store.stage(user,match[1],body.rows),{ok:true}):store.commit(user,match[1]));return;}
    if(url.pathname==='/api/declarations'){json(200,store.declare(user,body));return;}
    if(url.pathname==='/api/archive'){store.archive(user,body.key,body.version);json(200,{ok:true});return;}
    throw new ServiceError(404,'Funzione non disponibile.');
   }
   if(!['GET','HEAD'].includes(req.method))throw new ServiceError(405,'Operazione non supportata.');
   const asset=url.pathname.startsWith('/assets/'),root=asset?ASSETS:ROOT;
   const relative=asset?decodeURIComponent(url.pathname.slice(8)):url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
   const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw new ServiceError(404,'Non trovato.');
   let data;try{data=await fs.promises.readFile(file)}catch{throw new ServiceError(404,'Non trovato.');}
   const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream';
   res.writeHead(200,{...headers,'Content-Type':type}).end(req.method==='HEAD'?undefined:data);
  }catch(e){if(!res.headersSent)json(e instanceof ServiceError?e.status:500,{error:e instanceof ServiceError?e.message:'Operazione non riuscita. Riprova.'});else res.end();}
 });
}
if(require.main===module){
 const filename=process.env.SALCHECK_DATABASE_PATH,managerEmail=emailOf(process.env.SALCHECK_MANAGER_EMAIL||''),managerPassword=process.env.SALCHECK_MANAGER_PASSWORD||'';
 if(!filename||!path.isAbsolute(filename)||managerPassword.length<16)throw Error('Configurare percorso persistente archivio, email responsabile e password gestione di almeno 16 caratteri.');
 fs.mkdirSync(path.dirname(filename),{recursive:true});const store=new Store(filename,[idFor(managerEmail)]);
 const server=createServer({store,managerEmail,managerPassword,origins:(process.env.SALCHECK_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)});
 server.listen(Number(process.env.PORT||4177),process.env.SALCHECK_HOST||'127.0.0.1',()=>console.log('SALCheck email · servizio avviato.'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit()}));
}
module.exports={createServer,idFor};
