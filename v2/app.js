/* SALCheck V2 – vista nazionale; elaborazione esclusivamente nel browser */
(()=>{
'use strict';
const $=id=>document.getElementById(id), fx=window.SALCore;
const euroC=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v/100);
const number=v=>new Intl.NumberFormat('it-IT').format(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let book=null,scope='choose',network='all',selectedSite='',selectedYear='',siteSearch='',focus='',tab='full-sal',term='',coefficient='',page=0,fileName='',review=new Map(),activeRows=[],currentRows=[];
const PAGE=40;
function err(t){$('error').hidden=!t;$('error').textContent=t||''}
function loading(yes,message='',percentage=0){
 $('progress').hidden=!yes;$('progressText').textContent=message;$('progressBar').style.width=Math.min(100,Math.max(0,percentage))+'%';$('selectFile').disabled=yes;
}
function idToCode(id){const x=(book?.sites||[]).find(x=>x.key===id);return x?.code||id}
function parse(file){
 if(!file)return;if(!/\.csv$/i.test(file.name)){err('Carica il file CSV a 26 colonne (non il file XLSX).');return}
 if(file.size>300*1024*1024){err('File superiore a 300 MB: prepara un export più piccolo.');return}
 if(!window.Papa){err('Libreria CSV non disponibile. Controlla la connessione Internet.');return}
 book=null;$('dashboard').hidden=true;fileName=file.name;err('');loading(true,'Lettura in corso…',0);
 const base=fx.store();let failed=false,readRows=0;let lastProgress=0;const required=['CountryRete','Sede','CodiceCommessa','Venduto€','ProdottoLordo€','FatturatoTotale€','IncassatoTotale€'];
 window.Papa.parse(file,{
  header:true,worker:true,chunkSize:2*1024*1024,skipEmptyLines:'greedy',
  chunk:function(result,parser){
   if(failed)return;
   const keys=result.meta.fields||Object.keys(result.data[0]||{});
   const missing=required.filter(k=>!keys.includes(k));
   if(missing.length){failed=true;parser.abort();loading(false);err('Il file non contiene le colonne richieste: '+missing.join(', '));return}
   for(const row of result.data){base.add(row);readRows++}
   const p=Math.min(99,Math.round(((result.meta.cursor||0)/Math.max(1,file.size))*100));
   if(p>=lastProgress+3){lastProgress=p;loading(true,'Analizzate '+number(readRows)+' righe · '+p+'%',p)}
  },
  complete:function(){
   if(failed)return;
   try{
    const result=base.finalize(settings());
    if(!result.rows.length)throw Error('Non ho trovato pratiche con venduto positivo nel file.');
    book={...result,sourceStore:base};fileName=file.name;review=new Map();network='all';scope='choose';selectedYear='';focus='';tab='full-sal';siteSearch='';term='';coefficient='';page=0;
    $('networkFilter').value='all';$('siteFilter').value='';$('search').value='';$('coef').value='';
    renderYears();
    selectedSite='';renderAll();$('dashboard').hidden=false;
    $('fileLabel').textContent=fileName+' · '+number(result.stats.allRows)+' righe lette · '+number(result.sites.length)+' codici sede';
    $('inputInfo').textContent=number(file.size/1024/1024|0)+' MB · '+number(result.stats.allRows)+' righe · '+number(result.sites.length)+' sedi';
    loading(false);
   }catch(ex){loading(false);err('Impossibile elaborare: '+ex.message)}
  },
  error:function(e){failed=true;loading(false);err('Errore durante la lettura: '+(e.message||e))}
 });
}
function settings(){return {invoiceTolerance:Number($('tolInvoice').value),cashTolerance:Number($('tolCash').value),minSal:Number($('tolSal').value)}}
function renderYears(){
 const years=[...new Set(book.rows.map(x=>x.year).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
 $('yearFilter').innerHTML='<option value="">Tutti gli anni</option>'+years.map(y=>'<option value="'+esc(y)+'">'+esc(y)+'</option>').join('');
 $('yearFilter').value=selectedYear;
 $('yearInfo').textContent=years.length?'Anni delibera nel file: '+years.slice().reverse().join(' · '):'Anno non disponibile nell’export';
}
function keepSite(s){
 return (scope==='all'||selectedSite===s.key)&&(network==='all'||s.network===network)&&(!siteSearch||s.code.toLowerCase().includes(siteSearch.toLowerCase()));
}
function scoped(){const ids=new Set(book.sites.filter(keepSite).map(s=>s.key));return book.rows.filter(x=>ids.has(x.siteKey)&&(!selectedYear||x.year===selectedYear))}
function renderAll(){
 if(!book)return;
 document.querySelectorAll('[data-scope]').forEach(el=>el.classList.toggle('on',el.dataset.scope===scope));
 $('siteSelection').hidden=scope!=='choose';
 const hasSelection=scope==='all'||Boolean(selectedSite);
 $('emptyState').hidden=hasSelection;$('results').hidden=!hasSelection;
 activeRows=scoped();const scopedSites=new Set(activeRows.map(x=>x.siteKey));
 const totals=fx.summary(activeRows);
 $('scopeDescription').textContent=scopedSites.size+' sedi con pratiche vendute · '+(network==='all'?'Dirette + franchising':network)+' · '+(selectedYear?'Anno delibera '+selectedYear:'Tutti gli anni');
 $('kPrat').textContent=number(totals.practices);$('kSold').textContent='Venduto '+euroC(totals.venduto);
 $('kPaid').textContent=number(totals.paid);$('kPaidInfo').textContent=number(totals.invoice)+' fatturate integralmente';
 $('kFull').textContent=euroC(totals.fullSal);$('kFullInfo').textContent=number(totals.fullCount)+' pratiche · fatturate e incassate';
 $('kPartial').textContent=totals.partialCount?euroC(totals.pMin)+' – '+euroC(totals.pMax):'0,00 €';$('kPartialInfo').textContent=number(totals.partialCount)+' pratiche · valori teorici';
 let notices=[];
 if(totals.multiRows)notices.push(number(totals.multiRows)+' commesse con più righe economiche: i valori sono aggregati per codice e sede.');
 if(totals.possibleRepeats)notices.push(number(totals.possibleRepeats)+' commesse con righe economiche identiche: verifica l’eventuale duplicazione.');
 if(book.stats.invalid)notices.push(number(book.stats.invalid)+' righe non valide escluse.');
 if(!activeRows.length)notices.push('Nessuna pratica venduta per la selezione attuale.');
 $('alerts').hidden=!notices.length;$('alerts').textContent=notices.join(' ');
 renderSiteSelection();renderSites();renderTabs();renderDetails();
}
function renderSiteSelection(){
 const arr=book.sites.filter(s=>s.withSale>0&&(network==='all'||s.network===network)).sort((a,b)=>a.code.localeCompare(b.code)||a.network.localeCompare(b.network));
 $('chosenSite').innerHTML='<option value="">— Seleziona una sede —</option>'+arr.map(s=>'<option value="'+encodeURIComponent(s.key)+'">'+esc(s.code)+' · '+esc(s.network==='IT-Franchising'?'Franchising':'Diretta')+'</option>').join('');
 $('chosenSite').value=arr.some(s=>s.key===selectedSite)?encodeURIComponent(selectedSite):'';
 $('chosenHint').textContent=selectedSite?'Report della sede selezionata. Puoi cambiare sede in qualsiasi momento.':arr.length+' sedi disponibili. Nessuna selezione predefinita.';
}

function renderSites(){
 const groups=new Map();
 for(const r of activeRows){if(!groups.has(r.siteKey))groups.set(r.siteKey,[]);groups.get(r.siteKey).push(r)}
 const list=[...groups.entries()].map(([key,rows])=>({key,site:rows[0].site,network:rows[0].network,t:fx.summary(rows)})).sort((a,b)=>b.t.fullSal-a.t.fullSal||b.t.pMax-a.t.pMax);
 $('siteTable').innerHTML=list.map(x=>'<tr data-focus="'+esc(x.key)+'" class="'+(focus===x.key?'active':'')+'"><td><span class="site-code">'+esc(x.site)+'</span></td><td><span class="pill '+(x.network==='IT-Franchising'?'fr':'')+'">'+(x.network==='IT-Franchising'?'Franchising':'Diretta')+'</span></td><td class="numeric">'+number(x.t.practices)+'</td><td class="numeric money-strong">'+euroC(x.t.fullSal)+' <span class="soft">('+number(x.t.fullCount)+')</span></td><td class="numeric money-secondary">'+(x.t.partialCount?euroC(x.t.pMin)+' – '+euroC(x.t.pMax):'—')+' <span class="soft">('+number(x.t.partialCount)+')</span></td><td class="numeric">'+number(x.t.unpaid+x.t.unmatched+x.t.possibleRepeats)+'</td></tr>').join('')||'<tr><td colspan="6" class="empty">Nessuna sede da mostrare</td></tr>';
}
const TAB_LABELS={
 'full-sal':'SAL fatture complete','partial-sal':'SAL incassi parziali',
 'fully-paid':'Fatturate e incassate','invoiced-unpaid':'Fatturate non incassate','other':'Non riconciliate','all':'Tutte'
};
function matchTab(r){if(tab==='all')return true;if(tab==='fully-paid')return r.paid;return r.kind===tab}
function renderTabs(){
 const stats={};stats['full-sal']=activeRows.filter(x=>x.fullSal).length;stats['partial-sal']=activeRows.filter(x=>x.partial).length;stats['fully-paid']=activeRows.filter(x=>x.paid).length;stats['invoiced-unpaid']=activeRows.filter(x=>x.kind==='invoiced-unpaid').length;stats.other=activeRows.filter(x=>x.kind==='other').length;stats.all=activeRows.length;
 document.querySelectorAll('#tabs button').forEach(el=>{el.classList.toggle('active',el.dataset.tab===tab);el.innerHTML=esc(TAB_LABELS[el.dataset.tab])+'<span class="tabcount">'+number(stats[el.dataset.tab])+'</span>'});
}
function currentDetail(){
 return activeRows.filter(r=>(!focus||r.siteKey===focus)&&matchTab(r)
  &&(!coefficient||r.coefficient.split(' + ').includes(coefficient)||tab==='partial-sal'&&r.scenarios.some(x=>x.fx===coefficient))
  &&(!term||[r.code,r.site,r.address,r.state].some(x=>String(x).toLowerCase().includes(term))))
  .sort((a,b)=>(tab==='partial-sal'?b.pMax-a.pMax:tab==='full-sal'?b.remaining-a.remaining:b.venduto-a.venduto))
}
function moneyTd(c,strong){return '<td class="numeric '+(strong?'money-strong':'')+'">'+euroC(c)+'</td>'}
function selectReview(r){
 let cur=review.get(r.key)||'Da verificare';
 return '<select class="review" data-review="'+esc(r.key)+'">'+['Da verificare','Lavoro eseguito','Acconto','Da escludere'].map(x=>'<option '+(cur===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>'
}
function renderDetails(){
 $('focusTag').hidden=!focus;$('clearFocus').hidden=!focus;
 $('focusTag').textContent=focus?'Solo '+idToCode(focus):'';
 $('detailDescription').textContent=focus?'Dettaglio della sede '+idToCode(focus)+' · report identico alla V1':'Esamina le commesse della rete e verifica manualmente gli importi.';
 currentRows=currentDetail();const pages=Math.max(1,Math.ceil(currentRows.length/PAGE));page=Math.max(0,Math.min(page,pages-1));
 $('detailCount').textContent=number(currentRows.length)+' commesse';$('pageInfo').textContent=(page+1)+' / '+pages;$('prev').disabled=page===0;$('next').disabled=page>=pages-1;
 const c=['Commessa','Anno delibera','Sede','Rete','Stato (info)','Venduto','Prodotto','Fatturato netto','Incassato'];
 const ends=tab==='partial-sal'?['SAL minimo','SAL massimo','Regimi possibili','Verifica']:['Regime','SAL residuo','Righe','Verifica'];
 $('detailHead').innerHTML='<tr>'+[...c,...ends].map((x,i)=>'<th class="'+((i>=5&&i<=8||i===10||tab==='partial-sal'&&i===9)?'numeric':'')+'">'+x+'</th>').join('')+'</tr>';
 $('detailTable').innerHTML=currentRows.slice(page*PAGE,(page+1)*PAGE).map(r=>{
  let h='<tr><td><strong>'+esc(r.code)+'</strong><div class="original">'+esc(r.address).slice(0,70)+'</div></td><td>'+esc(r.year||'—')+'</td><td>'+esc(r.site)+'</td><td>'+esc(r.network==='IT-Franchising'?'Franchising':'Diretta')+'</td><td>'+esc(r.state)+'</td>';
  h+=moneyTd(r.venduto)+moneyTd(r.prodotto)+moneyTd(r.fatturato)+moneyTd(r.incassato);
  if(tab==='partial-sal'){
    let details='<details class="detail"><summary>'+r.scenarios.length+' ipotesi</summary><div>'+r.scenarios.map(x=>esc(x.fx)+': imponibile '+euroC(x.base)+' → SAL '+euroC(x.gap)).join('<br>')+'</div></details>';
    h+=moneyTd(r.pMin)+moneyTd(r.pMax,true)+'<td>'+details+'</td><td>'+selectReview(r)+'</td>';
  }else{
    h+='<td>'+esc(r.coefficient||'—')+'</td>'+moneyTd(r.remaining,r.fullSal)
    +'<td>'+(r.lines>1?'<span class="duplicate" title="'+(r.sameFinance?'Possibile duplicazione economica':'Righe economiche aggregate')+'">'+number(r.lines)+' righe'+(r.sameFinance?' ⚠':'')+'</span>':'1')+'</td><td>'+selectReview(r)+'</td>';
  }
  return h+'</tr>'
 }).join('')||'<tr><td colspan="13" class="empty">Nessuna pratica nei filtri selezionati.</td></tr>';
}
function recalculating(){
 if(!book)return;const data=settings();if(Object.values(data).some(x=>!Number.isFinite(x)||x<0)){err('Le tolleranze devono essere numeri non negativi.');return}
 const raw=book.sourceStore;book={...raw.finalize(data),sourceStore:raw};err('');page=0;renderAll();
}
function showScope(mode){scope=mode;focus='';page=0;renderAll()}
function exportRows(rows){return rows.map(r=>{
 const data={'Commessa':r.code,'Anno delibera':r.year,'Sede':r.site,'Rete':r.network,'Società':r.company,'Macroarea':r.area,'Stato (informativo)':r.state,'Indirizzo':r.address,
 'Venduto €':r.venduto/100,'Prodotto €':r.prodotto/100,'Fatturato netto €':r.fatturato/100,'Incassato €':r.incassato/100,
 'Regime compatibile':r.coefficient,'SAL venduto meno prodotto €':r.remaining/100,'SAL teorico min €':r.pMin/100,'SAL teorico max €':r.pMax/100,
 'Regimi teorici':r.scenarios.map(x=>x.fx).join(' / '),'Categoria':r.kind,'Righe aggregate':r.lines,'Righe economiche identiche':r.sameFinance?'Sì':'No',
 'Revisione':review.get(r.key)||'Da verificare'};
 for(const c of fx.FX){const x=r.scenarios.find(x=>x.fx===c.label);data['Base '+c.label+' €']=x?x.base/100:'';data['SAL '+c.label+' €']=x?x.gap/100:''}
 return data
})}
function summaryTable(){
 const by=new Map();
 for(const r of activeRows){if(!by.has(r.siteKey))by.set(r.siteKey,[]);by.get(r.siteKey).push(r)}
 return [...by.entries()].map(([key,rs])=>{const s=fx.summary(rs),r=rs[0];return {'Sede':r.site,'Rete':r.network,'Filtro anno':selectedYear||'Tutti gli anni','Pratiche vendute':s.practices,'Venduto €':s.venduto/100,'Prodotto €':s.prodotto/100,'Fatturato netto €':s.fatturato/100,'Incassato €':s.incassato/100,'Pratiche SAL completo':s.fullCount,'SAL fatture complete €':s.fullSal/100,'Pratiche SAL parziale':s.partialCount,'SAL parziale min €':s.pMin/100,'SAL parziale max €':s.pMax/100,'Anomalie codici ripetuti':s.possibleRepeats}}).sort((a,b)=>b['SAL fatture complete €']-a['SAL fatture complete €'])
}
function summaryYears(){
 const by=new Map();
 for(const r of activeRows){const key=r.year||'Anno non disponibile';if(!by.has(key))by.set(key,[]);by.get(key).push(r)}
 return [...by.entries()].map(([year,rows])=>{const t=fx.summary(rows);return {'Anno delibera':year,'Pratiche vendute':t.practices,'Venduto €':t.venduto/100,'Prodotto €':t.prodotto/100,'Fatturato netto €':t.fatturato/100,'Incassato €':t.incassato/100,'SAL su fatture complete €':t.fullSal/100,'Pratiche SAL fatture complete':t.fullCount,'SAL incassi parziali minimo €':t.pMin/100,'SAL incassi parziali massimo €':t.pMax/100,'Pratiche SAL incassi parziali':t.partialCount}})
 .sort((a,b)=>String(a['Anno delibera']).localeCompare(String(b['Anno delibera'])));
}
function csvSafe(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function downloadCSV(){
 const data=exportRows(currentRows);if(!data.length){err('Nessuna pratica da esportare con i filtri correnti.');return}
 const cols=Object.keys(data[0]),lines=[cols.map(csvSafe).join(';'),...data.map(x=>cols.map(k=>csvSafe(x[k])).join(';'))];
 const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SALCheck_V2_'+tab+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadXlsx(){
 if(!window.XLSX){err('Il modulo Excel non è disponibile; puoi esportare il CSV filtrato.');return}
 err('');const wb=XLSX.utils.book_new();
 const tabs=[
  ['Riepilogo sedi',summaryTable()],
  ['Riepilogo anni',summaryYears()],
  ['SAL fatture complete',exportRows(activeRows.filter(x=>x.fullSal))],
  ['SAL su incassi parziali',exportRows(activeRows.filter(x=>x.partial))],
  ['Fatturate incassate',exportRows(activeRows.filter(x=>x.paid))],
  ['Fatturate non incassate',exportRows(activeRows.filter(x=>x.kind==='invoiced-unpaid'))],
  ['Non riconciliate',exportRows(activeRows.filter(x=>x.kind==='other'))],
  ['Audit venduto',exportRows(activeRows)]
 ];
 for(const [name,data] of tabs){const sh=window.XLSX.utils.json_to_sheet(data.length?data:[{Info:'Nessuna pratica nella categoria'}]);sh['!cols']=Object.keys(data[0]||{Info:''}).map(k=>({wch:Math.min(39,Math.max(15,k.length+4))}));window.XLSX.utils.book_append_sheet(wb,sh,name)}
 window.XLSX.writeFile(wb,'SALCheck_V2_'+fileName.replace(/\.csv$/i,'').slice(0,55)+'.xlsx');
}
$('selectFile').onclick=e=>{e.stopPropagation();$('file').click()};
$('drop').onclick=e=>{if(e.target.closest('button'))return;$('file').click()};
$('file').onchange=e=>parse(e.target.files[0]);
for(const ev of ['dragover','drop'])$('drop').addEventListener(ev,e=>e.preventDefault());
$('drop').ondragover=()=>{$('drop').classList.add('dragging')};
$('drop').ondragleave=()=>{$('drop').classList.remove('dragging')};
$('drop').ondrop=e=>{$('drop').classList.remove('dragging');parse(e.dataTransfer.files[0])};
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>showScope(b.dataset.scope));
$('networkFilter').onchange=e=>{network=e.target.value;selectedSite='';focus='';page=0;renderAll()};
$('yearFilter').onchange=e=>{selectedYear=e.target.value;focus='';page=0;renderAll()};
$('siteFilter').oninput=e=>{siteSearch=e.target.value.trim();focus='';page=0;renderAll()};
$('clearSite').onclick=()=>{selectedSite='';focus='';page=0;renderAll()};
$('chosenSite').onchange=e=>{selectedSite=e.target.value?decodeURIComponent(e.target.value):'';focus='';page=0;renderAll()};
$('recalculate').onclick=recalculating;
$('siteTable').onclick=e=>{const tr=e.target.closest('tr[data-focus]');if(!tr)return;focus=tr.dataset.focus;tab='full-sal';page=0;term='';coefficient='';$('search').value='';$('coef').value='';renderSites();renderTabs();renderDetails();$('tabs').scrollIntoView({behavior:'smooth',block:'start'})};
$('clearFocus').onclick=()=>{focus='';renderSites();renderDetails()};
$('tabs').onclick=e=>{const b=e.target.closest('button[data-tab]');if(!b)return;tab=b.dataset.tab;page=0;renderTabs();renderDetails()};
$('search').oninput=e=>{term=e.target.value.toLowerCase();page=0;renderDetails()};
$('coef').onchange=e=>{coefficient=e.target.value;page=0;renderDetails()};
$('prev').onclick=()=>{page=Math.max(0,page-1);renderDetails()};
$('next').onclick=()=>{page++;renderDetails()};
$('detailTable').onchange=e=>{const t=e.target.closest('select[data-review]');if(t)review.set(t.dataset.review,t.value)};
$('exportCSV').onclick=downloadCSV;$('exportExcel').onclick=downloadXlsx;
})();
