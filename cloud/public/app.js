(()=>{'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=n=>n===null||n===undefined?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n/100),date=s=>s?new Date(s).toLocaleString('it-IT'):'—';
const label=s=>s==='EDAC_BS'?'Brescia 1':s==='EDAC_BS2'?'Brescia 2':s;
const outcomes=['Da verificare','SAL da caricare','Già registrato','Lavoro non eseguito','Acconto','Da approfondire','Da escludere'];
let token='',data,managerMode=false,busy=false,casePage=0,historyOffset=0,historyMore=false,service,reportRevision=null;
function message(s){$('message').textContent=s}
function clear(){token='';data=null;reportRevision=null;document.body.classList.remove('signed-in');$('v2Report').contentWindow.SALReport?.clear();document.querySelectorAll('[data-view]').forEach(x=>{x.setAttribute('aria-pressed',String(x.dataset.view==='reportView'));$(x.dataset.view).hidden=x.dataset.view!=='reportView'});$('workspace').hidden=true;$('entry').hidden=false;$('logout').hidden=true;$('identity').textContent='Responsabili Area';$('cases').replaceChildren();$('followups').replaceChildren();$('history').replaceChildren();}
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
 return `<tr data-key="${esc(key)}"><td><b>${esc(label(r.site))}</b><br>${esc(r.code)}</td><td class="num">${euro(r.prodotto)}</td><td class="num">${r.fullSal?euro(r.remaining):r.partial?euro(r.pMin)+' – '+euro(r.pMax):'—'}</td><td><select aria-label="Dichiarazione ${esc(r.code)}">${outcomes.map(s=>`<option${s===(d?.status||'Da verificare')?' selected':''}>${esc(s)}</option>`).join('')}</select></td><td><input type="number" min="0.01" step="0.01" max="10000000000" aria-label="SAL da caricare ${esc(r.code)}" value="${amount===null?'':amount/100}"${p?' disabled':''}></td><td><textarea rows="1" maxlength="1400" aria-label="Note ${esc(r.code)}">${esc(d?.notes||'')}</textarea></td><td><button data-save="${esc(key)}">Salva</button></td></tr>`;
 }).join('')||'<tr><td colspan="7" class="empty">Nessuna pratica da mostrare per questa email.</td></tr>';
}
function renderFollowups(){
 const rows=data.followups,names=['In attesa del prossimo CSV','Importo riscontrato','Aumento parziale','Nessun aumento'];
 $('stats').innerHTML=names.map(s=>`<span><b>${rows.filter(x=>x.status===s).length}</b> ${esc(s)}</span>`).join('');
 $('followups').innerHTML=rows.map(x=>{const d=x.declaration;return `<tr><td><b>${esc(label(d.site))}</b><br>${esc(d.code)}${data.user.role==='manager'?'<br>'+esc(d.ra):''}</td><td>${esc(date(d.promise.at))}</td><td class="num">${euro(d.promise.baseline)}</td><td class="num">${euro(d.promise.expected)}</td><td class="num">${euro(x.product)}</td><td class="num">${euro(x.delta)}</td><td class="num">${euro(x.remaining)}</td><td><b>${esc(x.status)}</b><br><span class="small">Dichiarazione: ${esc(d.status)}</span>${data.user.role==='manager'&&!d.promise.closedAt?`<br><button class="secondary" data-archive="${esc(encodeURIComponent(d.key))}">Chiudi impegno</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">Nessun SAL ancora dichiarato.</td></tr>';
}
async function renderHistory(){
 const h=await request('/api/history?offset='+historyOffset);historyMore=h.hasMore;
 $('historyPage').textContent='Pagina '+(historyOffset/100+1);$('historyPrevious').disabled=!historyOffset;$('historyNext').disabled=!historyMore;
 $('history').innerHTML=h.entries.map(x=>{const d=x.event==='comparison'?x.data.declaration:x.data,p=d.promise;return `<tr><td>${esc(date(x.at))}</td><td>${esc({declaration:'Dichiarazione salvata',comparison:'Nuovo CSV',archive:'Impegno chiuso'}[x.event])}${x.source?'<br>'+esc(x.source):''}</td><td>${esc(x.actorEmail||d.ra)}</td><td>${esc(label(d.site)+' · '+d.code)}</td><td>${esc(x.event==='comparison'?x.data.status:d.status)}</td><td class="num">${euro(p?.expected)}</td><td class="num">${euro(x.event==='comparison'?x.data.delta:p?.closure?.delta)}</td><td class="notes">${esc(d.notes)}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">Lo storico verrà compilato con i primi salvataggi.</td></tr>';
}
window.addEventListener('message',e=>{const frame=$('v2Report');if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='sal-report-height'&&Number.isFinite(e.data.height))frame.style.height=Math.max(650,Math.min(50000,e.data.height+10))+'px'});
async function loadReport(){
 const frame=$('v2Report');if(!frame.contentWindow.SALReport)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Il report V2 non si è aperto. Ricarica la pagina.')),15000);frame.addEventListener('load',()=>{clearTimeout(timer);resolve()},{once:true})});
 const report=frame.contentWindow.SALReport;if(!report)throw Error('Report V2 non disponibile.');
 if(reportRevision===data.revision){report.updateDeclarations(data.declarations||[]);return}
 report.clear();$('reportLoading').hidden=false;let cursor='',rows=[];
 do{const result=await request('/api/report?revision='+encodeURIComponent(data.revision)+'&cursor='+encodeURIComponent(cursor));rows.push(...result.rows);cursor=result.next;$('reportLoading').textContent='Caricamento report V2: '+rows.length+' pratiche…'}while(cursor);
 report.mount({rows,declarations:data.declarations||[],source:data.source,user:data.user,onDownload:(bytes,name,type)=>{const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)},onSave:async input=>{await request('/api/declarations',input);await refresh();message('Dichiarazione salvata nello storico condiviso.')}});
 reportRevision=data.revision;$('reportLoading').hidden=true;
}
async function refresh(){
 data=await request('/api/overview?summary=1');document.body.classList.add('signed-in');$('entry').hidden=true;$('logout').hidden=false;$('workspace').hidden=false;$('identity').textContent=data.user.email+(data.user.role==='manager'?' · Gestione CSV':'');$('managerPanel').hidden=data.user.role!=='manager';
 const sites=data.sites.map(label);$('mySites').textContent=data.user.role==='manager'?'Tutte le sedi pubblicate':sites.length?sites.join(' · '):'Nessuna sede disponibile per la tua email';
 $('source').textContent=data.source?'Aggiornamento: '+date(data.source.publishedAt)+(data.user.role==='manager'?' · '+data.source.source:''):'Nessun CSV ancora pubblicato.';
 renderCases();renderFollowups();await renderHistory();await loadReport();
}
$('entry').onsubmit=e=>{e.preventDefault();run(async()=>{const s=await request('/api/session',{email:$('email').value},false);token=s.token;casePage=historyOffset=0;await refresh();message(data.sites.length?'Report V2 aggiornato sulle sedi associate alla tua email.':'Nessuna pratica pubblicata per questa email. Controlla l’indirizzo o attendi il CSV del responsabile.');})};
$('logout').onclick=()=>run(async()=>{try{await request('/api/logout',{})}finally{clear();message('Sessione chiusa. Lo storico resta salvato.')}});
$('refresh').onclick=()=>run(async()=>{await refresh();message('Dati aggiornati dall’archivio condiviso.')});
$('search').oninput=()=>{casePage=0;renderCases()};
$('casePrevious').onclick=()=>{casePage--;renderCases()};$('caseNext').onclick=()=>{casePage++;renderCases()};
$('historyPrevious').onclick=()=>run(async()=>{historyOffset=Math.max(0,historyOffset-100);await renderHistory()});$('historyNext').onclick=()=>run(async()=>{if(historyMore){historyOffset+=100;await renderHistory()}});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-view]').forEach(x=>{x.setAttribute('aria-pressed',String(x===b));$(x.dataset.view).hidden=x!==b})});
$('cases').onclick=e=>{const button=e.target.closest('[data-save]');if(!button)return;run(async()=>{
 const key=decodeURIComponent(button.dataset.save),r=data.cases.find(x=>x.key===key),tr=button.closest('tr'),raw=tr.querySelector('input').value,status=tr.querySelector('select').value;
 if(status==='SAL da caricare'&&raw==='')throw Error('Indica il SAL che ti impegni a caricare prima di salvare.');
 await request('/api/declarations',{key,status,expected:raw===''?null:Math.round(Number(raw)*100),notes:tr.querySelector('textarea').value,version:r.declaration?.version||0});await refresh();message('Dichiarazione salvata con data, autore e punto di partenza.');
 })};
$('followups').onclick=e=>{const b=e.target.closest('[data-archive]');if(!b)return;const key=decodeURIComponent(b.dataset.archive),d=data.followups.find(x=>x.declaration.key===key).declaration;
 if(!confirm('Chiudere questo impegno? Dichiarazioni e confronti restano nello storico. Un nuovo impegno partirà dal CSV corrente.'))return;
 run(async()=>{await request('/api/archive',{key,version:d.version});await refresh();message('Impegno chiuso e conservato nello storico.')});};
$('csv').onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(file)run(()=>publish(file))};
async function publish(file){
 if(!/\.csv$/i.test(file.name)||file.size>300*1024*1024)throw Error('Scegli un CSV Albert fino a 300 MB.');
 const source=SALCore.store();$('importStatus').textContent='Lettura del CSV…';
 const prefix=new Uint8Array(await file.slice(0,3).arrayBuffer()),payload=prefix[0]===239&&prefix[1]===187&&prefix[2]===191?file.slice(3):file;
 await new Promise((resolve,reject)=>{let failed=false;Papa.parse(payload,{header:true,worker:true,skipEmptyLines:'greedy',chunkSize:2*1024*1024,chunk(result,parser){
  const required=['CountryRete','Sede','ResponsabileArea','CodiceCommessa','Venduto€','ProdottoLordo€','FatturatoTotale€','IncassatoTotale€'];
  if(result.errors.length||required.some(k=>!result.meta.fields?.includes(k))){failed=true;parser.abort();reject(Error('CSV non valido: controlla intestazioni, delimitatori e importi. Il file precedente resta attivo.'));return;}
  result.data.forEach(r=>source.add(r));$('importStatus').textContent='Lette '+sourceCount(result)+' righe nel blocco corrente…';
 },complete(){if(!failed)resolve()},error:reject});});
 const result=source.finalize();if(result.stats.invalid||!result.rows.length)throw Error('CSV incompleto o con righe non valide. Nessun aggiornamento pubblicato.');
 if(!confirm('Pubblicare '+result.rows.length+' pratiche da '+file.name+'? Le dichiarazioni e i confronti precedenti resteranno nello storico.')){$('importStatus').textContent='Pubblicazione annullata.';return;}
 const job=await request('/api/imports',{source:file.name,count:result.rows.length,baseRevision:data.revision});
 const fields=['key','network','site','code','ra','year','venduto','prodotto','fatturato','incassato','fullSal','partial','pMin','pMax','financeLines','oldDelibera','area','company','state','address','lines','sameFinance','yearConflict'];
 for(let i=0;i<result.rows.length;i+=500){const rows=result.rows.slice(i,i+500).map(r=>Object.fromEntries(fields.map(k=>[k,r[k]])));await request('/api/imports/'+job.id+'/rows',{rows});$('importStatus').textContent='Preparazione '+Math.min(i+500,result.rows.length)+' / '+result.rows.length+' pratiche…';}
 await request('/api/imports/'+job.id+'/commit',{});historyOffset=0;await refresh();$('importStatus').textContent='CSV pubblicato. Riscontri aggiunti allo storico.';message('Nuovo CSV confrontato con le dichiarazioni precedenti.');await backupAfterImport();
}
function sourceCount(result){return result.data.length}
let backupFolder=null;
const backupMessage=s=>$('backupStatus').textContent=s;
async function folderPreference(value){return new Promise((resolve,reject)=>{const opening=indexedDB.open('salcheck-preferences',1);opening.onupgradeneeded=()=>opening.result.createObjectStore('settings');opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{const db=opening.result,tx=db.transaction('settings',value?'readwrite':'readonly'),store=tx.objectStore('settings'),r=value?store.put(value,'backupFolder'):store.get('backupFolder');r.onsuccess=()=>resolve(value||r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close()}})}
async function restoreFolder(){try{backupFolder=await folderPreference();if(backupFolder)backupMessage('Cartella selezionata: '+backupFolder.name+'. I permessi verranno verificati al salvataggio.')}catch{backupMessage('Preferenza cartella non disponibile. Puoi scaricare la copia.')}}
function backupName(){return 'SALCheck-storico-'+new Date().toISOString().replace(/[:.]/g,'-')+'.jsonl'}
async function backupResponse(){const r=await fetch(service+'/api/backup',{headers:{Authorization:'Bearer '+token},credentials:'same-origin',redirect:'error'});if(!r.ok){let e;try{e=await r.json()}catch{}throw Error(e?.error||'Copia non disponibile.')}return r}
async function saveFolderBackup(ask){if(!backupFolder)throw Error('Prima collega una cartella OneDrive su questo computer.');let permission=await backupFolder.queryPermission({mode:'readwrite'});if(permission!=='granted'&&ask)permission=await backupFolder.requestPermission({mode:'readwrite'});if(permission!=='granted')throw Error('Premi Salva copia per autorizzare la scrittura nella cartella.');backupMessage('Salvataggio copia in corso…');const name=backupName(),file=await backupFolder.getFileHandle(name,{create:true}),writer=await file.createWritable();try{const r=await backupResponse();await r.body.pipeTo(writer);backupMessage('Copia salvata in '+backupFolder.name+': '+name+'. La sincronizzazione online è gestita da OneDrive.')}catch(e){try{await writer.abort()}catch{}try{await backupFolder.removeEntry(name)}catch{}throw e}}
async function backupAfterImport(){try{await saveFolderBackup(false)}catch(e){backupMessage('CSV pubblicato. Copia OneDrive ancora da salvare: '+e.message)}}
$('linkFolder').onclick=async()=>{if(!window.showDirectoryPicker){backupMessage('Apri il sito in Chrome o Edge per scegliere una cartella. Puoi anche usare Scarica copia.');return}try{backupFolder=await showDirectoryPicker({id:'salcheck-backup',mode:'readwrite'});await folderPreference(backupFolder);backupMessage('Cartella collegata: '+backupFolder.name+'. Premi Salva copia per la prima copia.')}catch(e){if(e.name!=='AbortError')backupMessage('Cartella non collegata: '+e.message)}};
$('saveBackup').onclick=()=>run(async()=>{try{await saveFolderBackup(true)}catch(e){backupMessage('Copia non salvata: '+e.message);throw e}});
$('downloadBackup').onclick=()=>run(async()=>{backupMessage('Preparazione copia…');const r=await backupResponse(),blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=backupName();a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);backupMessage('Download avviato. Sposta il file nella cartella OneDrive per conservarlo online.');});
(async()=>{try{const base=String(window.SALCHECK_SERVICE_URL||'').replace(/\/$/,'');service=base||(/\.github\.io$/.test(location.hostname)?null:location.origin);
 if(!service)throw Error('Archivio condiviso non ancora collegato. Questa versione non salva dichiarazioni finché il servizio non è attivato.');
 const c=await request('/api/config',undefined,false);if(!c.ready)throw Error('Archivio condiviso da configurare.');message('Inserisci la tua email per aprire le sedi associate nel CSV.');await restoreFolder();if(new URLSearchParams(location.search).get('gestione')==='1'){const s=await request('/api/session',{manager:true},false);token=s.token;await refresh();message('Gestione aperta. Importa il CSV per aggiornare tutte le sedi.');}
 }catch(e){$('login').disabled=true;message(e.message||'Archivio condiviso non disponibile.')}})();
})();
