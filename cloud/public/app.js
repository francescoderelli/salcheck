(()=>{'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=n=>n===null||n===undefined?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n/100),date=s=>s?new Date(s).toLocaleString('it-IT'):'—';
const label=s=>s==='EDAC_BS'?'Brescia 1':s==='EDAC_BS2'?'Brescia 2':s;
const outcomes=['Da verificare','SAL da caricare','Già registrato','Lavoro non eseguito','Acconto','Da approfondire','Da escludere'];
let token='',data,managerMode=false,busy=false,casePage=0,followupPage=0,historyOffset=0,historyMore=false,uploadOffset=0,uploadMore=false,service,reportRevision=null,reportSite='',reportNetwork='',reportScopeKey='';
function message(s){$('message').textContent=s}
function clear(){token='';data=null;reportRevision=null;reportSite='';reportNetwork='';reportScopeKey='';$('detailArea').hidden=true;$('v4Dashboard').hidden=true;document.body.classList.remove('signed-in');$('v2Report').contentWindow.SALReport?.clear();document.querySelectorAll('[data-view]').forEach(x=>{x.setAttribute('aria-pressed',String(x.dataset.view==='reportView'));$(x.dataset.view).hidden=x.dataset.view!=='reportView'});$('workspace').hidden=true;$('entry').hidden=false;$('logout').hidden=true;$('identity').textContent='Responsabili Area';$('cases').replaceChildren();$('followups').replaceChildren();$('history').replaceChildren();}
async function run(fn){if(busy)return;busy=true;$('workspace').inert=true;$('entry').inert=true;try{await fn()}catch(e){message(e.message||'Operazione non riuscita.')}finally{busy=false;$('workspace').inert=false;$('entry').inert=false}}
async function request(route,body,authorized=true){
 const response=await fetch(service+route,{method:body===undefined?'GET':'POST',headers:{...(authorized?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},credentials:'same-origin',redirect:'error',body:body===undefined?undefined:JSON.stringify(body)});
 let value;try{value=await response.json()}catch{throw Error('L’archivio condiviso non risponde. Nessuna modifica confermata.');}
 if(!response.ok){if(response.status===401&&authorized)clear();throw Error(value.error||'Operazione non riuscita.');}return value;
}
function filteredCases(){const q=$('search').value.trim().toLowerCase();return data.cases.filter(r=>!q||[r.site,label(r.site),r.code].some(x=>x.toLowerCase().includes(q)))}
function renderCases(){
 const rows=filteredCases(),pages=Math.max(1,Math.ceil(rows.length/50));casePage=Math.min(casePage,pages-1);
 $('caseCount').textContent=rows.length+' pratiche';$('casePage').textContent=(casePage+1)+' / '+pages;$('casePrevious').disabled=casePage===0;$('caseNext').disabled=casePage+1>=pages;
 $('cases').innerHTML=rows.slice(casePage*50,(casePage+1)*50).map(r=>{const d=r.declaration,p=d?.promise&&!d.promise.closedAt?d.promise:null,key=encodeURIComponent(r.key),amount=p?.expected??(r.fullSal?r.remaining:null);
 return `<tr data-key="${esc(key)}"><td><b>${esc(label(r.site))}</b><br>${esc(r.code)}</td><td class="num">${euro(r.prodotto)}</td><td class="num">${r.fullSal?euro(r.remaining):r.partial?euro(r.pMin)+' – '+euro(r.pMax):'—'}</td><td><select aria-label="Dichiarazione ${esc(r.code)}">${outcomes.map(s=>`<option${s===(d?.status||'Da verificare')?' selected':''}>${esc(s)}</option>`).join('')}</select></td><td><span>${euro(amount)}</span></td><td><textarea rows="1" maxlength="1400" aria-label="Note ${esc(r.code)}">${esc(d?.notes||'')}</textarea></td><td><button data-save="${esc(key)}">Salva</button></td></tr>`;
 }).join('')||'<tr><td colspan="7" class="empty">Nessuna pratica da mostrare per questa email.</td></tr>';
 if(data.user.role==='director'){$('cases').querySelectorAll('select,textarea').forEach(x=>x.disabled=true);$('cases').querySelectorAll('[data-save]').forEach(x=>x.remove())}
}
function renderFollowups(){
 const rows=data.followups||[],names=['In attesa del prossimo CSV','Importo riscontrato','Aumento parziale','Nessun aumento'];
 $('stats').innerHTML=names.map(s=>'<span><b>'+rows.filter(x=>x.status===s).length+'</b> '+esc(s)+'</span>').join('');
 // Avoid building thousands of table elements in a hidden view or on every refresh.
 const PAGE_SIZE=100,pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 followupPage=Math.max(0,Math.min(followupPage,pages-1));
 const visible=rows.slice(followupPage*PAGE_SIZE,(followupPage+1)*PAGE_SIZE);
 $('followupPage').textContent=(followupPage+1)+' / '+pages+' · '+rows.length.toLocaleString('it-IT')+' impegni';
 $('followupPrevious').disabled=followupPage===0;
 $('followupNext').disabled=followupPage>=pages-1;
 $('followups').innerHTML=visible.map(x=>{
  const d=x.declaration;return `<tr><td><b>${esc(label(d.site))}</b><br>${esc(d.code)}${data.user.role!=='ra'?'<br>'+esc(d.ra):''}</td><td>${esc(date(d.promise.at))}</td><td class="num">${euro(d.promise.baseline)}</td><td class="num">${euro(d.promise.expected)}</td><td class="num">${euro(x.product)}</td><td class="num">${euro(x.delta)}</td><td class="num">${euro(x.remaining)}</td><td><b>${esc(x.status)}</b><br><span class="small">Dichiarazione: ${esc(d.status)}</span>${(data.user.role==='manager'||data.user.role==='operational_director')&&!d.promise.closedAt?`<br><button class="secondary" data-archive="${esc(encodeURIComponent(d.key))}">Chiudi impegno</button>`:''}</td></tr>`;
 }).join('')||'<tr><td colspan="8" class="empty">Nessun SAL ancora dichiarato.</td></tr>';
}
async function renderUploads(){
 const result=await request('/api/import-log?offset='+uploadOffset);
 uploadMore=result.hasMore;
 $('uploadPage').textContent='Pagina '+(uploadOffset/50+1);
 $('uploadPrevious').disabled=uploadOffset===0;
 $('uploadNext').disabled=!uploadMore;
 $('uploads').innerHTML=result.items.map(x=>'<tr><td>'+esc(date(x.publishedAt))+'</td><td>'+esc(x.kind)+'</td><td>'+esc(x.source)+'</td><td>'+esc(x.owner)+'</td><td class="num">'+Number(x.count||0).toLocaleString('it-IT')+'</td></tr>').join('')||'<tr><td colspan="5" class="empty">Nessuna importazione pubblicata.</td></tr>';
}
async function renderHistory(){
 const h=await request('/api/history?offset='+historyOffset);historyMore=h.hasMore;
 $('historyPage').textContent='Pagina '+(historyOffset/100+1);$('historyPrevious').disabled=!historyOffset;$('historyNext').disabled=!historyMore;
 $('history').innerHTML=h.entries.map(x=>{const d=x.event==='comparison'?x.data.declaration:x.data,p=d.promise;return `<tr><td>${esc(date(x.at))}</td><td>${esc({declaration:'Dichiarazione salvata',comparison:'Nuovo CSV',archive:'Impegno chiuso'}[x.event])}${x.source?'<br>'+esc(x.source):''}</td><td>${esc(x.actorEmail||d.ra)}</td><td>${esc(label(d.site)+' · '+d.code)}</td><td>${esc(x.event==='comparison'?x.data.status:d.status)}</td><td class="num">${euro(p?.expected)}</td><td class="num">${euro(x.event==='comparison'?x.data.delta:p?.closure?.delta)}</td><td class="notes">${esc(d.notes)}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">Lo storico verrà compilato con i primi salvataggi.</td></tr>';
}
window.addEventListener('message',e=>{const frame=$('v2Report');if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='sal-report-height'&&Number.isFinite(e.data.height))frame.style.height=Math.max(650,Math.min(50000,e.data.height+10))+'px'});
async function fetchReportRows(revision,reportRev,site='',network=''){
 const args='revision='+encodeURIComponent(revision)+'&reportRevision='+encodeURIComponent(reportRev)+'&site='+encodeURIComponent(site)+'&network='+encodeURIComponent(network);
 const response=await fetch(service+'/api/report-stream?'+args,{
  headers:{Authorization:'Bearer '+token,Accept:'application/x-ndjson'},
  credentials:'same-origin',redirect:'error',cache:'no-store'
 });
 // Support an older backend during coordinated rollout; never bypass 401/403/409.
 if(response.status===404)return fetchReportRowsLegacy(args);
 if(!response.ok){
  let reason='Impossibile caricare il report.';
  try{reason=(await response.json()).error||reason}catch{}
  if(response.status===401)clear();
  throw Error(reason);
 }
 if(!response.body||!response.body.getReader)throw Error('Il browser non supporta il flusso dei dati. Apri SALCheck in un browser aggiornato.');
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let pending='',rows=[],done=false;
 const progress=()=>{
  $('reportLoading').textContent='Caricamento del report V4: '+rows.length.toLocaleString('it-IT')+' pratiche ricevute…';
 };
 function consumeLine(line){
  if(!line.trim())return;
  const item=JSON.parse(line);
  if(item.type==='page'&&Array.isArray(item.rows)){rows.push(...item.rows);progress();return}
  if(item.type==='complete'&&item.revision===revision&&item.reportRevision===reportRev){done=true;return}
  throw Error('Il report contiene una revisione inattesa. Ricarica i dati.');
 }
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   pending+=decoder.decode(part.value,{stream:true});
   let pos;
   while((pos=pending.indexOf('\n'))>=0){
    const line=pending.slice(0,pos);pending=pending.slice(pos+1);
    consumeLine(line);
   }
  }
  pending+=decoder.decode();
  if(pending.trim())consumeLine(pending);
  if(!done)throw Error('Caricamento interrotto: nessun report parziale è stato applicato.');
  return rows;
 }finally{reader.releaseLock()}
}
async function fetchReportRowsLegacy(args){
 let cursor='',rows=[];
 do{
  const result=await request('/api/report?'+args+'&cursor='+encodeURIComponent(cursor));
  rows.push(...result.rows);
  cursor=result.next;
  $('reportLoading').textContent='Caricamento report V4: '+rows.length.toLocaleString('it-IT')+' pratiche…';
 }while(cursor);
 return rows;
}
async function loadReport(){
 const frame=$('v2Report');
 if(!frame.contentWindow.SALReport)await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Il report V2 non si è aperto. Ricarica la pagina.')),15000);
  frame.addEventListener('load',()=>{clearTimeout(timer);resolve()},{once:true});
 });
 const report=frame.contentWindow.SALReport;
 if(!report)throw Error('Report economico non disponibile.');
 const snapshot=data,revision=snapshot.reportRevision||snapshot.revision;
 const scopeKey=revision+'|'+reportNetwork+'|'+reportSite;
 if(reportScopeKey===scopeKey){report.updateDeclarations(snapshot.declarations||[]);$('reportLoading').hidden=true;return}
 $('reportLoading').hidden=false;
 $('reportLoading').textContent='Preparazione report V4…';
 const rows=await fetchReportRows(snapshot.revision,revision,reportSite,reportNetwork);
 // The import can change while the stream is in flight: never mount mismatched data.
 if(data!==snapshot)throw Error('Il CSV è stato aggiornato durante il caricamento: premi Aggiorna.');
 $('reportLoading').textContent='Elaborazione economica di '+rows.length.toLocaleString('it-IT')+' pratiche…';
 // Yield so the browser can paint the progress message before the heavy V2 calculation.
 await new Promise(resolve=>setTimeout(resolve,0));
 report.mount({rows,declarations:snapshot.declarations||[],source:snapshot.source,user:snapshot.user,
  onDownload:(bytes,name,type)=>{const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)},
  onSave:async input=>{await request('/api/declarations',input);await refresh();message('Dichiarazione salvata nello storico condiviso.')}
 });
 reportRevision=revision;reportScopeKey=scopeKey;
 $('reportLoading').hidden=true;
}
const prettyCount=n=>new Intl.NumberFormat('it-IT').format(n||0);
function fastMoney(cents){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format((cents||0)/100)}
function renderFastDashboard(result){
 const all=result.sites||[],cols=['practices','venduto','fullSal','partialCount','pMin','pMax','fullCount'];
 const total=Object.fromEntries(cols.map(k=>[k,all.reduce((sum,x)=>sum+(Number(x[k])||0),0)]));
 $('fastPractices').textContent=prettyCount(total.practices);
 $('fastSites').textContent=prettyCount(all.length)+' sedi/reti';
 $('fastSold').textContent=fastMoney(total.venduto);
 $('fastFull').textContent=fastMoney(total.fullSal);
 $('fastFullCount').textContent=prettyCount(total.fullCount)+' pratiche';
 $('fastPartial').textContent=total.partialCount?(total.pMin===total.pMax?fastMoney(total.pMin):fastMoney(total.pMin)+' – '+fastMoney(total.pMax)):'0 €';
 $('fastPartialCount').textContent=prettyCount(total.partialCount)+' pratiche · ipotesi IVA';
 $('fastDescription').textContent=prettyCount(all.length)+' sedi/reti · '+prettyCount(total.practices)+' commesse · riepilogo dal database';
 const ranked=all.slice().sort((a,b)=>Number(b.fullSal||0)-Number(a.fullSal||0)||Number(b.pMax||0)-Number(a.pMax||0)||(a.site||'').localeCompare(b.site||''));
 $('fastSiteRows').innerHTML=ranked.map(x=>{
  const site=String(x.site||''),network=String(x.network||'');
  const range=Number(x.partialCount||0)?(x.pMin===x.pMax?fastMoney(x.pMin):fastMoney(x.pMin)+' – '+fastMoney(x.pMax)):'—';
  return '<tr><td><button type="button" class="fast-site-link" data-site="'+encodeURIComponent(site)+'" data-network="'+encodeURIComponent(network)+'">'+esc(label(site))+'</button></td>'+
   '<td>'+esc(network==='IT-Franchising'?'Franchising':'Diretta')+'</td><td class="num">'+prettyCount(x.practices)+'</td>'+
   '<td class="num">'+fastMoney(x.fullSal)+'</td><td class="num">'+range+'</td></tr>';
 }).join('')||'<tr><td colspan="5" class="empty">Nessuna pratica pubblicata per questo accesso.</td></tr>';
 $('v4Dashboard').hidden=!$('detailArea').hidden;
}
async function showDetailedReport(site='',network=''){
 // No database-wide row transfer is started until the user explicitly opens the detailed view.
 reportSite=site;reportNetwork=network;reportScopeKey='';
 $('detailArea').hidden=false;
 $('v4Dashboard').hidden=true;
 $('detailScope').textContent=site?'Dettaglio pratiche · '+label(site):'Report completo · tutte le sedi autorizzate';
 $('reportLoading').hidden=false;
 await loadReport();
}
$('fastSiteRows').onclick=e=>{
 const button=e.target.closest('button[data-site]');if(!button)return;
 run(()=>showDetailedReport(decodeURIComponent(button.dataset.site),decodeURIComponent(button.dataset.network)));
};
$('fullDetail').onclick=()=>run(()=>showDetailedReport());
$('closeDetail').onclick=()=>{$('detailArea').hidden=true;$('v4Dashboard').hidden=false;};

async function refresh(){
 data=await request('/api/overview?summary=1');document.body.classList.add('signed-in');$('entry').hidden=true;$('logout').hidden=false;$('workspace').hidden=false;$('identity').textContent=data.user.email+(data.user.role==='manager'?' · Gestione CSV':data.user.role==='operational_director'?' · Direzione operativa · Tutte le pratiche':data.user.role==='director'?' · Direzionale · Sola consultazione':'');$('managerPanel').hidden=data.user.role!=='manager';$('uploadsNav').hidden=data.user.role==='ra';
 const sites=data.sites.map(label);$('mySites').textContent=data.user.role!=='ra'?'Tutte le sedi pubblicate':sites.length?sites.join(' · '):'Nessuna sede disponibile per la tua email';
 $('source').textContent=data.source?'Aggiornamento: '+date(data.source.publishedAt)+(data.user.role==='manager'?' · '+data.source.source:''):'Nessun CSV ancora pubblicato.';
 renderCases();if(!$('followupView').hidden)renderFollowups();
 if(!$('historyView').hidden)await renderHistory();if(!$('uploadsView').hidden)await renderUploads();
 const fast=await request('/api/dashboard');
 if(fast.revision!==data.revision||fast.reportRevision!==(data.reportRevision||data.revision))
  throw Error('Il CSV è cambiato: aggiorna nuovamente.');
 renderFastDashboard(fast);
 if(!$('detailArea').hidden)await loadReport();
}
$('entry').onsubmit=e=>{e.preventDefault();run(async()=>{const s=await request('/api/session',{email:$('email').value},false);token=s.token;casePage=followupPage=historyOffset=uploadOffset=0;await refresh();message(data.sites.length?(data.user.role==='director'?'Accesso direzionale: tutte le sedi, in sola consultazione.':'Report V2 aggiornato sulle sedi associate alla tua email.'):'Nessuna pratica pubblicata per questa email. Controlla l’indirizzo o attendi il CSV del responsabile.');})};
$('logout').onclick=()=>run(async()=>{try{await request('/api/logout',{})}finally{clear();message('Sessione chiusa. Lo storico resta salvato.')}});
$('refresh').onclick=()=>run(async()=>{await refresh();message('Dati aggiornati dall’archivio condiviso.')});
$('search').oninput=()=>{casePage=0;renderCases()};
$('casePrevious').onclick=()=>{casePage--;renderCases()};$('caseNext').onclick=()=>{casePage++;renderCases()};
$('followupPrevious').onclick=()=>{followupPage=Math.max(0,followupPage-1);renderFollowups()};
$('followupNext').onclick=()=>{followupPage++;renderFollowups()};
$('uploadPrevious').onclick=()=>run(async()=>{uploadOffset=Math.max(0,uploadOffset-50);await renderUploads()});
$('uploadNext').onclick=()=>run(async()=>{if(uploadMore){uploadOffset+=50;await renderUploads()}});
$('historyPrevious').onclick=()=>run(async()=>{historyOffset=Math.max(0,historyOffset-100);await renderHistory()});$('historyNext').onclick=()=>run(async()=>{if(historyMore){historyOffset+=100;await renderHistory()}});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('[data-view]').forEach(x=>{x.setAttribute('aria-pressed',String(x===b));$(x.dataset.view).hidden=x!==b});
 if(b.dataset.view==='historyView')run(renderHistory);
 if(b.dataset.view==='uploadsView')run(renderUploads);
 if(b.dataset.view==='followupView')renderFollowups();
});
$('cases').onclick=e=>{const button=e.target.closest('[data-save]');if(!button)return;run(async()=>{
 const key=decodeURIComponent(button.dataset.save),r=data.cases.find(x=>x.key===key),tr=button.closest('tr'),status=tr.querySelector('select').value;
 await request('/api/declarations',{key,status,expected:null,notes:tr.querySelector('textarea').value,version:r.declaration?.version||0});await refresh();message('Dichiarazione salvata con data, autore e punto di partenza.');
 })};
$('followups').onclick=e=>{const b=e.target.closest('[data-archive]');if(!b)return;const key=decodeURIComponent(b.dataset.archive),d=data.followups.find(x=>x.declaration.key===key).declaration;
 if(!confirm('Chiudere questo impegno? Dichiarazioni e confronti restano nello storico. Un nuovo impegno partirà dal CSV corrente.'))return;
 run(async()=>{await request('/api/archive',{key,version:d.version});await refresh();message('Impegno chiuso e conservato nello storico.')});};
$('csv').onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(file)run(()=>publish(file))};
$('completeMetadata').onclick=()=>$('metadataCsv').click();
$('metadataCsv').onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(file)run(()=>publish(file,true))};
async function publish(file,metadataOnly=false){
 if(!/\.csv$/i.test(file.name)||file.size>300*1024*1024)throw Error('Scegli un CSV Albert fino a 300 MB.');
 const source=SALCore.store();$('importStatus').textContent='Lettura del CSV…';
 const prefix=new Uint8Array(await file.slice(0,3).arrayBuffer()),payload=prefix[0]===239&&prefix[1]===187&&prefix[2]===191?file.slice(3):file;
 await new Promise((resolve,reject)=>{let failed=false;Papa.parse(payload,{header:true,worker:true,skipEmptyLines:'greedy',chunkSize:2*1024*1024,chunk(result,parser){
  const required=['CountryRete','Sede','ResponsabileArea','CodiceCommessa','Venduto€','ProdottoLordo€','FatturatoTotale€','IncassatoTotale€'];
  if(result.errors.length||required.some(k=>!result.meta.fields?.includes(k))){failed=true;parser.abort();reject(Error('CSV non valido: controlla intestazioni, delimitatori e importi. Il file precedente resta attivo.'));return;}
  result.data.forEach(r=>source.add(r));$('importStatus').textContent='Lette '+sourceCount(result)+' righe nel blocco corrente…';
 },complete(){if(!failed)resolve()},error:reject});});
 const result=source.finalize();if(result.stats.invalid||!result.rows.length)throw Error('CSV incompleto o con righe non valide. Nessun aggiornamento pubblicato.');
 if(!confirm(metadataOnly?'Recuperare indirizzi e dettagli da '+file.name+'? Procederò solo se tutte le pratiche e gli importi coincidono con il CSV online. Dichiarazioni e storico restano invariati.':'Pubblicare '+result.rows.length+' pratiche da '+file.name+'? Le dichiarazioni e i confronti precedenti resteranno nello storico.')){$('importStatus').textContent='Pubblicazione annullata.';return;}
 const job=await request('/api/imports',{source:file.name,count:result.rows.length,baseRevision:data.revision});
 const fields=['key','network','site','code','ra','year','venduto','prodotto','fatturato','incassato','fullSal','partial','pMin','pMax','financeLines','oldDelibera','area','company','state','address','lines','sameFinance','yearConflict'];
 for(let i=0;i<result.rows.length;i+=500){const rows=result.rows.slice(i,i+500).map(r=>Object.fromEntries(fields.map(k=>[k,r[k]])));await request('/api/imports/'+job.id+'/rows',{rows});$('importStatus').textContent='Preparazione '+Math.min(i+500,result.rows.length)+' / '+result.rows.length+' pratiche…';}
 await request('/api/imports/'+job.id+(metadataOnly?'/metadata':'/commit'),{});reportRevision=null;historyOffset=0;await refresh();$('importStatus').textContent=metadataOnly?'Indirizzi e dettagli recuperati. Importi, dichiarazioni e confronti invariati.':'CSV pubblicato. Riscontri aggiunti allo storico.';message(metadataOnly?'Indirizzi recuperati dal CSV originale.':'Nuovo CSV confrontato con le dichiarazioni precedenti.');await backupAfterImport();
}
function sourceCount(result){return result.data.length}
let backupFolder=null;
const backupMessage=s=>$('backupStatus').textContent=s;
async function folderPreference(value){return new Promise((resolve,reject)=>{const opening=indexedDB.open('salcheck-preferences',1);opening.onupgradeneeded=()=>opening.result.createObjectStore('settings');opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{const db=opening.result,tx=db.transaction('settings',value?'readwrite':'readonly'),store=tx.objectStore('settings'),r=value?store.put(value,'backupFolder'):store.get('backupFolder');r.onsuccess=()=>resolve(value||r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close()}})}
async function restoreFolder(){try{backupFolder=await folderPreference();if(backupFolder)backupMessage('Cartella selezionata: '+backupFolder.name+'. I permessi verranno verificati al salvataggio.')}catch{backupMessage('Preferenza cartella non disponibile. Puoi scaricare la copia.')}}
function backupName(){return 'SALCheck-storico-'+new Date().toISOString().replace(/[:.]/g,'-')+'.jsonl'}
async function backupResponse(){const r=await fetch(service+'/api/backup',{headers:{Authorization:'Bearer '+token},credentials:'same-origin',redirect:'error'});if(!r.ok){let e;try{e=await r.json()}catch{}throw Error(e?.error||'Copia non disponibile.')}return r}
async function saveFolderBackup(ask){if(!backupFolder)throw Error('Prima collega una cartella OneDrive su questo computer.');let permission=await backupFolder.queryPermission({mode:'readwrite'});if(permission!=='granted'&&ask)permission=await backupFolder.requestPermission({mode:'readwrite'});if(permission!=='granted')throw Error('Premi Salva copia per autorizzare la scrittura nella cartella.');backupMessage('Salvataggio copia in corso…');const name=backupName(),file=await backupFolder.getFileHandle(name,{create:true}),writer=await file.createWritable();try{const r=await backupResponse();await r.body.pipeTo(writer);backupMessage('Copia salvata in '+backupFolder.name+': '+name+'. La sincronizzazione online è gestita da OneDrive.')}catch(e){try{await writer.abort()}catch{}try{await backupFolder.removeEntry(name)}catch{}throw e}}
async function backupAfterImport(){try{await saveFolderBackup(false)}catch(e){backupMessage('Archivio aggiornato. Copia OneDrive ancora da salvare: '+e.message)}}
$('linkFolder').onclick=async()=>{if(!window.showDirectoryPicker){backupMessage('Apri il sito in Chrome o Edge per scegliere una cartella. Puoi anche usare Scarica copia.');return}try{backupFolder=await showDirectoryPicker({id:'salcheck-backup',mode:'readwrite'});await folderPreference(backupFolder);backupMessage('Cartella collegata: '+backupFolder.name+'. Premi Salva copia per la prima copia.')}catch(e){if(e.name!=='AbortError')backupMessage('Cartella non collegata: '+e.message)}};
$('saveBackup').onclick=()=>run(async()=>{try{await saveFolderBackup(true)}catch(e){backupMessage('Copia non salvata: '+e.message);throw e}});
$('downloadBackup').onclick=()=>run(async()=>{backupMessage('Preparazione copia…');const r=await backupResponse(),blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=backupName();a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);backupMessage('Download avviato. Sposta il file nella cartella OneDrive per conservarlo online.');});
(async()=>{try{const base=String(window.SALCHECK_SERVICE_URL||'').replace(/\/$/,'');service=base||(/\.github\.io$/.test(location.hostname)?null:location.origin);
 if(!service)throw Error('Archivio condiviso non ancora collegato. Questa versione non salva dichiarazioni finché il servizio non è attivato.');
 const c=await request('/api/config',undefined,false);if(!c.ready)throw Error('Archivio condiviso da configurare.');message('Inserisci la tua email per aprire le sedi associate nel CSV.');await restoreFolder();const mode=new URLSearchParams(location.search);
 if(mode.get('gestione')==='1'||mode.get('direzione')==='1'){
  const isManager=mode.get('gestione')==='1';
  const session=await request('/api/session',isManager?{manager:true}:{operational:true},false);
  token=session.token;
  await refresh();
  message(isManager?'Gestione aperta. Importa il CSV per aggiornare tutte le sedi.':'Direzione operativa: puoi verificare e salvare tutte le pratiche senza modificare i CSV.');
 }
 }catch(e){$('login').disabled=true;message(e.message||'Archivio condiviso non disponibile.')}})();
})();
