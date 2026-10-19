/* SALCheck V2 – vista nazionale; elaborazione esclusivamente nel browser */
(()=>{
'use strict';
const $=id=>document.getElementById(id), fx=window.SALCore;
const euroC=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v/100);
const number=v=>new Intl.NumberFormat('it-IT').format(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let book=null,scope='choose',network='all',selectedSites=new Set(),selectedMacroarea='',selectedYear='',siteSearchTerm='',focus='',tab='full-sal',term='',coefficient='',bankRate='',page=0,fileName='',review=new Map(),scenarioChoices=new Map(),activeRows=[],currentRows=[],rowLookup=new Map(),detailSort={key:'',dir:'asc'},siteSort={key:'',dir:'asc'};
const PAGE=40;
const IVA_LABELS={
  '100%':'Reverse charge / split payment',
  '106%':'IVA 10% e ritenuta 4%',
  '110%':'IVA 10%',
  '118%':'IVA 22% e ritenuta 4%',
  '122%':'IVA 22%'
};
// Internal multiplier keys and saved choices remain unchanged.
function ivaLabel(code){return String(code||'').split(' + ').map(x=>IVA_LABELS[x]||x).join(' + ')}

const REVIEW_STORAGE_KEY='salcheck-v2-practice-review-v1';
const SCENARIO_STORAGE_KEY='salcheck-v2-partial-regime-v1';
const REVIEW_OPTIONS=['Da verificare','Lavoro eseguito','Acconto','Da escludere'];
const REVIEW_EXCLUDES=new Set(['Acconto','Da escludere']);
function isExcluded(r){return REVIEW_EXCLUDES.has(review.get(r.key))}
function selectedScenario(r){
 const choice=scenarioChoices.get(r.key);
 return choice?r.scenarios.find(s=>s.fx===choice)||null:null;
}
function simulatedRange(r){
 const selected=selectedScenario(r);
 return selected?{min:selected.gap,max:selected.gap,scenario:selected}:{min:r.pMin,max:r.pMax,scenario:null};
}
// All table categories use the same base, so selecting IVA in partial-SAL updates
// the "Tutte" category and any exported record without changing the underlying finance data.
function taxableBase(r){
 if(r.fatturato<=0)return null;
 const selected=selectedScenario(r);
 if(selected)return {min:selected.base,max:selected.base,origin:'IVA fattura scelta (simulazione)'};
 if(r.full&&Number.isFinite(r.invoiceBase)){
  return {min:r.invoiceBase,max:r.invoiceBase,origin:'Calcolato su fattura riconciliata'};
 }
 const bases=r.scenarios.map(s=>s.base);
 if(!bases.length)return null;
 return {min:Math.min(...bases),max:Math.max(...bases),origin:'Intervallo teorico, IVA fattura da verificare'};
}
function taxableCell(r){
 const val=taxableBase(r);
 if(!val)return '<td class="numeric taxable-unknown" title="Nessun imponibile ricavabile dai dati disponibili">—</td>';
 const content=val.min===val.max?euroC(val.min):euroC(val.min)+' – '+euroC(val.max);
 return '<td class="numeric '+(val.origin==='IVA fattura scelta (simulazione)'?'taxable-chosen':'')+
  '" title="'+esc(val.origin)+'">'+content+'</td>';
}
function financialSummary(rows){
 const totals=fx.summary(rows),eligible=rows.filter(r=>!isExcluded(r)),summary=fx.summary(eligible);
 const excludedFull=rows.filter(r=>r.fullSal&&isExcluded(r)).length;
 const excludedPartial=rows.filter(r=>r.partial&&isExcluded(r)).length;
 const withholdingCount=rows.filter(r=>r.cashWithholdingRate>0).length;
 const withholding8Count=rows.filter(r=>r.cashWithholdingRate===8).length;
 const withholding11Count=rows.filter(r=>r.cashWithholdingRate===11).length;
 const withholdingTotal=rows.filter(r=>r.cashWithholdingRate>0).reduce((sum,r)=>sum+r.bankWithholding,0);
 let pMin=0,pMax=0,partialCount=0,chosenCount=0,pendingCount=0,zeroCount=0;
 const minSal=fx.cent(book?.settings?.minSal??1);
 for(const r of eligible){
  if(!r.partial)continue;
  const chosen=simulatedRange(r),max=chosen.max;
  if(chosen.scenario)chosenCount++;else pendingCount++;
  if(max>minSal){pMin+=chosen.min;pMax+=chosen.max;partialCount++}
  else zeroCount++;
 }
 return {...totals,fullCount:summary.fullCount,fullSal:summary.fullSal,
  partialCount,pMin,pMax,chosenCount,pendingCount,zeroCount,excludedFull,excludedPartial,
  withholdingCount,withholding8Count,withholding11Count,withholdingTotal};
}
function reviewSignature(r){return [r.key,r.venduto,r.prodotto,r.fatturato,r.incassato].join('|')}
function storedScenarios(){try{return JSON.parse(window.localStorage.getItem(SCENARIO_STORAGE_KEY)||'{}')||{}}catch(e){return {}}}
function restoreScenarios(rows){
 const saved=storedScenarios();scenarioChoices=new Map();
 for(const r of rows){
  const choice=saved[reviewSignature(r)];
  if(choice&&r.scenarios.some(s=>s.fx===choice))scenarioChoices.set(r.key,choice);
 }
}
function saveScenario(r,choice){
 if(choice&&!r.scenarios.some(s=>s.fx===choice))return;
 if(choice)scenarioChoices.set(r.key,choice);else scenarioChoices.delete(r.key);
 try{
  const saved=storedScenarios(),key=reviewSignature(r);
  if(choice)saved[key]=choice;else delete saved[key];
  window.localStorage.setItem(SCENARIO_STORAGE_KEY,JSON.stringify(saved));
 }catch(e){/* Browser senza storage: la scelta rimane valida fino alla chiusura. */}
}
function storedReviews(){try{return JSON.parse(window.localStorage.getItem(REVIEW_STORAGE_KEY)||'{}')||{}}catch(e){return {}}}
function restoreReviews(rows){
 const saved=storedReviews();review=new Map();
 for(const r of rows){const value=saved[reviewSignature(r)];if(REVIEW_OPTIONS.includes(value)&&value!=='Da verificare')review.set(r.key,value)}
}
function saveReview(r,value){
 if(!REVIEW_OPTIONS.includes(value))return;
 if(value==='Da verificare')review.delete(r.key);else review.set(r.key,value);
 try{
  const stored=storedReviews(),key=reviewSignature(r);
  if(value==='Da verificare')delete stored[key];else stored[key]=value;
  window.localStorage.setItem(REVIEW_STORAGE_KEY,JSON.stringify(stored));
 }catch(e){/* Private-browser mode: edits remain in memory and exports. */}
}
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
    book={...result,sourceStore:base};rowLookup=new Map(result.rows.map(r=>[r.key,r]));fileName=file.name;restoreReviews(result.rows);restoreScenarios(result.rows);network='all';scope='choose';selectedSites.clear();selectedMacroarea='';selectedYear='';siteSearchTerm='';focus='';tab='full-sal';term='';coefficient='';bankRate='';page=0;
    $('networkFilter').value='all';$('siteSearchInput').value='';$('search').value='';$('coef').value='';$('bankRateFilter').value='';
    renderMacroareas();
    setPickerOpen(false);
    renderYears();
    renderFileScope();
    renderAll();$('dashboard').hidden=false;
    $('fileLabel').textContent=fileName+' · '+number(result.stats.allRows)+' righe lette · '+number(result.sites.length)+' codici sede';
    $('inputInfo').textContent=number(file.size/1024/1024|0)+' MB · '+number(result.stats.allRows)+' righe · '+number(result.sites.length)+' sedi';
    loading(false);
   }catch(ex){loading(false);err('Impossibile elaborare: '+ex.message)}
  },
  error:function(e){failed=true;loading(false);err('Errore durante la lettura: '+(e.message||e))}
 });
}
function settings(){return {invoiceTolerance:Number($('tolInvoice').value),cashTolerance:Number($('tolCash').value),minSal:Number($('tolSal').value)}}
function renderFileScope(){
 const stats=book.stats,areas=stats.macroareas||[];
 $('fileMacroareas').textContent=!stats.macroareaColumnPresent?'Campo macroarea non presente':
  areas.length?areas.map(a=>a.name+' ('+number(a.count)+(a.count===1?' riga':' righe')+')').join(' · '):'Nessuna macroarea rilevata';
 $('fileScopeNote').textContent=stats.macroareaColumnPresent
  ?'Perimetro reale del file importato · '+number(stats.allRows)+' righe lette. La presenza di più macroaree non garantisce, da sola, che siano comprese tutte le sedi italiane.'
  :'Questo export non permette di identificare le macroaree: controlla il filtro della dashboard prima di confrontare i totali nazionali.';
}
const COMMON_MACROAREAS=['NORD','CENTRO','SUD','N/A','Non indicata'];
function areaName(v){return String(v??'').trim()||'Non indicata'}
function renderMacroareas(){
 const extras=(book.stats.macroareas||[]).map(a=>a.name).filter(x=>!COMMON_MACROAREAS.includes(x)).sort((a,b)=>a.localeCompare(b));
 const options=[...COMMON_MACROAREAS,...extras];
 $('macroareaFilter').innerHTML='<option value="">Tutte le macroaree</option>'+
 options.map(name=>'<option value="'+esc(name)+'">'+esc(name==='NORD'?'Nord':name==='CENTRO'?'Centro':name==='SUD'?'Sud':name)+'</option>').join('');
 $('macroareaFilter').value=selectedMacroarea;
}
function matchesMacroarea(r){return !selectedMacroarea||areaName(r.area)===selectedMacroarea}
function renderYears(){
 const years=[...new Set(book.rows.map(x=>x.year).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
 $('yearFilter').innerHTML='<option value="">Tutti gli anni</option>'+years.map(y=>'<option value="'+esc(y)+'">'+esc(y)+'</option>').join('');
 $('yearFilter').value=selectedYear;
 $('yearInfo').textContent=years.length?'Anni delibera nel file: '+years.slice().reverse().join(' · '):'Anno non disponibile nell’export';
}
function keepSite(s){
 return (scope==='all'||selectedSites.has(s.key))&&(network==='all'||s.network===network);
}
function scoped(){const ids=new Set(book.sites.filter(keepSite).map(s=>s.key));return book.rows.filter(x=>ids.has(x.siteKey)&&matchesMacroarea(x)&&(!selectedYear||x.year===selectedYear))}
function renderAll(){
 if(!book)return;
 document.querySelectorAll('[data-scope]').forEach(el=>el.classList.toggle('on',el.dataset.scope===scope));
 $('siteSelection').hidden=scope!=='choose';
 const hasSelection=scope==='all'||selectedSites.size>0;
 $('emptyState').hidden=hasSelection;$('results').hidden=!hasSelection;
 activeRows=scoped();const scopedSites=new Set(activeRows.map(x=>x.siteKey));
 const totals=financialSummary(activeRows);
 $('scopeDescription').textContent=scopedSites.size+' sedi con pratiche vendute · '+(network==='all'?'Dirette + franchising':network)+' · '+(selectedMacroarea?'Macroarea '+selectedMacroarea:'Tutte le macroaree')+' · '+(selectedYear?'Anno delibera '+selectedYear:'Tutti gli anni');
 $('kPrat').textContent=number(totals.practices);$('kSold').textContent='Venduto '+euroC(totals.venduto);
 $('kPaid').textContent=number(totals.paid);$('kPaidInfo').textContent=number(totals.invoice)+' fatturate integralmente'+(totals.withholdingCount?' · '+number(totals.withholdingCount)+' incassi compatibili con ritenuta bancaria (8%: '+number(totals.withholding8Count)+', 11%: '+number(totals.withholding11Count)+')':'');
 $('kFull').textContent=euroC(totals.fullSal);$('kFullInfo').textContent=number(totals.fullCount)+' pratiche conteggiate'+(totals.excludedFull?' · '+number(totals.excludedFull)+' escluse/acconti':'')+' · netto revisioni';
 $('kPartial').textContent=totals.partialCount?(totals.pMin===totals.pMax?euroC(totals.pMin):euroC(totals.pMin)+' – '+euroC(totals.pMax)):'0,00 €';
 $('kPartialInfo').textContent=number(totals.partialCount)+' pratiche con SAL · '+number(totals.chosenCount)+(totals.chosenCount===1?' simulazione IVA impostata':' simulazioni IVA impostate')+' · '+number(totals.pendingCount)+' da simulare'+(totals.zeroCount?' · '+number(totals.zeroCount)+' SAL a zero':'')+(totals.excludedPartial?' · '+number(totals.excludedPartial)+' escluse/acconti':'');
 let notices=[];
 if(totals.multiRows)notices.push(number(totals.multiRows)+' commesse con più righe economiche: i valori sono aggregati per codice e sede.');
 if(totals.possibleRepeats)notices.push(number(totals.possibleRepeats)+' commesse con righe economiche identiche: verifica l’eventuale duplicazione.');
 if(book.stats.invalid)notices.push(number(book.stats.invalid)+' righe non valide escluse.');
 if(!activeRows.length)notices.push('Nessuna pratica venduta per la selezione attuale.');
 $('alerts').hidden=!notices.length;$('alerts').textContent=notices.join(' ');
 renderSiteSelection();renderSites();renderTabs();renderDetails();
}
function pickerSiteOptions(){
 if(!book)return;
 const query=siteSearchTerm.trim().toLocaleLowerCase('it');
 const eligibleSiteKeys=new Set(book.rows.filter(r=>matchesMacroarea(r)).map(r=>r.siteKey));
 const sites=book.sites.filter(s=>s.withSale>0&&eligibleSiteKeys.has(s.key)&&(network==='all'||s.network===network))
 .filter(s=>!query||s.code.toLocaleLowerCase('it').includes(query)||s.network.toLocaleLowerCase('it').includes(query))
 .sort((a,b)=>a.code.localeCompare(b.code)||a.network.localeCompare(b.network));
 $('siteOptions').innerHTML=sites.map(s=>'<label class="picker-option"><input type="checkbox" data-site="'+encodeURIComponent(s.key)+'" '+(selectedSites.has(s.key)?'checked':'')+
 '><span class="picker-code">'+esc(s.code)+'</span><span class="picker-network">'+esc(s.network==='IT-Franchising'?'Franchising':'Diretta')+'</span></label>').join('')
 ||'<p class="picker-no-results">Nessuna sede trovata. Prova un altro codice.</p>';
 $('siteMatchCount').textContent=number(sites.length)+(sites.length===1?' sede trovata':' sedi trovate');
}
function setPickerOpen(open){
 $('sitePickerPanel').hidden=!open;
 $('sitePickerToggle').setAttribute('aria-expanded',open?'true':'false');
 if(open){pickerSiteOptions();$('siteSearchInput').focus()}
}
function renderSiteSelection(){
 const chosen=[...selectedSites].map(key=>book.sites.find(s=>s.key===key)).filter(Boolean)
 .sort((a,b)=>a.code.localeCompare(b.code)||a.network.localeCompare(b.network));
 $('selectedCount').textContent='('+number(chosen.length)+(chosen.length===1?' selezionata)':' selezionate)');
 $('sitePickerLabel').textContent=chosen.length?number(chosen.length)+(chosen.length===1?' sede selezionata · cerca per aggiungerne altre':' sedi selezionate · cerca per aggiungerne altre'):'Cerca e seleziona le sedi…';
 $('selectedChips').innerHTML=chosen.map(s=>'<button class="selected-chip" type="button" data-remove-site="'+encodeURIComponent(s.key)+'" title="Rimuovi '+esc(s.code)+'" aria-label="Rimuovi '+esc(s.code)+'">'+esc(s.code)+' <span aria-hidden="true">×</span></button>').join('');
 $('chosenHint').textContent=chosen.length?'Il report somma solo le sedi selezionate'+(network!=='all'?' appartenenti alla rete filtrata':'')+'. Puoi aggiungerne o rimuoverne altre.':'Apri il menu, cerca e spunta le sedi da analizzare insieme.';
 pickerSiteOptions();
}

function renderSites(){
 const groups=new Map();
 for(const r of activeRows){if(!groups.has(r.siteKey))groups.set(r.siteKey,[]);groups.get(r.siteKey).push(r)}
 const list=[...groups.entries()].map(([key,rows])=>({key,site:rows[0].site,network:rows[0].network,t:financialSummary(rows)}));
 const siteValue=(x,key)=>key==='practices'?x.t.practices:key==='fullSal'?x.t.fullSal:key==='partialMax'?x.t.pMax:key==='anomalies'?x.t.unpaid+x.t.unmatched+x.t.possibleRepeats:0;
 list.sort((a,b)=>siteSort.key
  ?(siteValue(a,siteSort.key)-siteValue(b,siteSort.key))*(siteSort.dir==='asc'?1:-1)||a.site.localeCompare(b.site)
  :b.t.fullSal-a.t.fullSal||b.t.pMax-a.t.pMax||a.site.localeCompare(b.site));
 document.querySelectorAll('[data-site-sort]').forEach(button=>{
  const selected=button.dataset.siteSort===siteSort.key;
  const heading=button.closest('th'),icon=button.querySelector('.sort-indicator');
  if(icon)icon.textContent=selected?(siteSort.dir==='asc'?'↑':'↓'):'↕';
  button.classList.toggle('is-sorted',selected);
  if(heading)heading.setAttribute('aria-sort',selected?(siteSort.dir==='asc'?'ascending':'descending'):'none');
 });
 $('siteTable').innerHTML=list.map(x=>'<tr data-focus="'+esc(x.key)+'" class="'+(focus===x.key?'active':'')+'"><td><span class="site-code">'+esc(x.site)+'</span></td><td><span class="pill '+(x.network==='IT-Franchising'?'fr':'')+'">'+(x.network==='IT-Franchising'?'Franchising':'Diretta')+'</span></td><td class="numeric">'+number(x.t.practices)+'</td><td class="numeric money-strong">'+euroC(x.t.fullSal)+' <span class="soft">('+number(x.t.fullCount)+')</span></td><td class="numeric money-secondary">'+(x.t.partialCount?(x.t.pMin===x.t.pMax?euroC(x.t.pMin):euroC(x.t.pMin)+' – '+euroC(x.t.pMax)):'—')+' <span class="soft">('+number(x.t.partialCount)+')</span></td><td class="numeric">'+number(x.t.unpaid+x.t.unmatched+x.t.possibleRepeats)+'</td></tr>').join('')||'<tr><td colspan="6" class="empty">Nessuna sede da mostrare</td></tr>';
}
const TAB_LABELS={
 'full-sal':'SAL fatture complete','partial-sal':'SAL incassi parziali',
 'fully-paid':'Fatturate e incassate','invoiced-unpaid':'Fatturate non incassate','other':'Non riconciliate','all':'Tutte'
};
function matchTab(r){if(tab==='all')return true;if(tab==='fully-paid')return r.paid;return r.kind===tab}
function renderTabs(){
 const stats={};stats['full-sal']=activeRows.filter(x=>x.fullSal).length;stats['partial-sal']=activeRows.filter(x=>x.partial).length;stats['fully-paid']=activeRows.filter(x=>x.paid).length;stats['invoiced-unpaid']=activeRows.filter(x=>x.kind==='invoiced-unpaid').length;stats.other=activeRows.filter(x=>x.kind==='other').length;stats.all=activeRows.length;
 document.querySelectorAll('#tabs button').forEach(el=>{
  el.classList.toggle('active',el.dataset.tab===tab);
  const category=el.dataset.tab;
  const removed=(category==='full-sal'?activeRows.filter(r=>r.fullSal&&isExcluded(r)).length:category==='partial-sal'?activeRows.filter(r=>r.partial&&isExcluded(r)).length:0);
  el.innerHTML=esc(TAB_LABELS[category])+'<span class="tabcount">'+number(stats[category])+(removed?' · '+number(removed)+' escluse/acconti':'')+'</span>';
 });
}
function matchesIvaFilter(r){
 if(!coefficient)return true;
 const chosen=selectedScenario(r);
 // When a regime is selected in the partial-SAL tab, also honor it in "Tutte".
 if(chosen)return chosen.fx===coefficient;
 if(r.coefficient&&r.coefficient.split(' + ').includes(coefficient))return true;
 return r.partial&&r.scenarios.some(x=>x.fx===coefficient);
}
function matchesBankFilter(r){
 if(!bankRate)return true;
 const rate=Number(r.cashWithholdingRate)||0;
 return bankRate==='none'?rate===0:rate===Number(bankRate);
}
function currentDetail(){
 return activeRows.filter(r=>(!focus||r.siteKey===focus)&&matchTab(r)
  &&matchesIvaFilter(r)&&matchesBankFilter(r)
  &&(!term||[r.code,r.site,r.address,r.state].some(x=>String(x).toLowerCase().includes(term))))
  .sort((a,b)=>{
   if(detailSort.key){
    const field=detailSort.key,dir=detailSort.dir==='asc'?1:-1;
    const val=r=>field==='simSal'?simulatedRange(r).max:field==='taxBase'?(taxableBase(r)?.max??-1):(Number(r[field])||0);
    return (val(a)-val(b))*dir||a.code.localeCompare(b.code);
   }
   return (tab==='partial-sal'?simulatedRange(b).max-simulatedRange(a).max:tab==='full-sal'?b.remaining-a.remaining:b.venduto-a.venduto)||a.code.localeCompare(b.code);
  })
}
function moneyTd(c,strong){return '<td class="numeric '+(strong?'money-strong':'')+'">'+euroC(c)+'</td>'}
function cashTd(r){
 if(!r.cashWithholdingRate)return moneyTd(r.incassato);
 return '<td class="numeric" title="Incasso compatibile con bonifico parlante: ritenuta bancaria '+r.cashWithholdingRate+'% su base convenzionale ottenuta scorporando il 22% dal bonifico lordo. Verificare la data del bonifico">'+
 euroC(r.incassato)+'<div class="withholding-marker">Ritenuta '+r.cashWithholdingRate+'% compatibile: '+euroC(r.bankWithholding)+'</div></td>';
}
function selectScenario(r){
 const chosen=selectedScenario(r);
 return '<select class="scenario-picker '+(chosen?'has-choice':'')+'" data-scenario="'+encodeURIComponent(r.key)+'" title="Scegli l’IVA fattura da simulare per la pratica">'+
 '<option value="">— IVA da verificare (intervallo) —</option>'+
 r.scenarios.map(s=>'<option value="'+esc(s.fx)+'" '+(chosen?.fx===s.fx?'selected':'')+'>'+esc(ivaLabel(s.fx))+' · SAL '+euroC(s.gap)+'</option>').join('')+'</select>';
}
function selectReview(r){
 let cur=review.get(r.key)||'Da verificare';
 return '<select class="review" data-review="'+encodeURIComponent(r.key)+'" title="Acconto e Da escludere azzerano il contributo al SAL potenziale">'+REVIEW_OPTIONS.map(x=>'<option '+(cur===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>'
}
function renderDetails(){
 $('focusTag').hidden=!focus;$('clearFocus').hidden=!focus;
 $('clearFocus').textContent=scope==='all'?'← Torna a tutte le sedi':'← Torna alle sedi selezionate';
 $('focusTag').textContent=focus?'Solo '+idToCode(focus):'';
 $('detailDescription').textContent=tab==='partial-sal'
  ?'Scegli l’IVA fattura: imponibile e SAL si aggiornano subito. Se non è ancora stata scelta, mostriamo gli intervalli teorici.'
  :(focus?'Dettaglio della sede '+idToCode(focus)+' · report identico alla V1':'Esamina le commesse della rete e verifica manualmente gli importi.');
 const validSortKeys=tab==='partial-sal'?['venduto','prodotto','fatturato','incassato','taxBase','simSal']:['venduto','prodotto','fatturato','incassato','taxBase','remaining'];
 if(detailSort.key&&!validSortKeys.includes(detailSort.key))detailSort={key:'',dir:'asc'};
 currentRows=currentDetail();const pages=Math.max(1,Math.ceil(currentRows.length/PAGE));page=Math.max(0,Math.min(page,pages-1));
 $('detailCount').textContent=number(currentRows.length)+(currentRows.length===1?' commessa':' commesse')+(bankRate?' · Ritenuta '+(bankRate==='none'?'non riconosciuta':bankRate+'%'):'')+(currentRows.some(isExcluded)?' · '+number(currentRows.filter(isExcluded).length)+' escluse/acconti, ancora visibili':'');$('pageInfo').textContent=(page+1)+' / '+pages;$('prev').disabled=page===0;$('next').disabled=page>=pages-1;
 const headers=[
  {label:'Commessa'},{label:'Anno delibera'},{label:'Sede'},{label:'Rete'},{label:'Stato (info)'},
  {label:'Venduto',key:'venduto'},{label:'Prodotto',key:'prodotto'},
  {label:'Fatturato netto a pagare',key:'fatturato'},{label:'Incassato',key:'incassato'},
  ...(tab==='partial-sal'?[{label:'IVA fattura'},{label:'Imponibile fattura',key:'taxBase'},{label:'SAL simulato / intervallo',key:'simSal'}]:
  [{label:'IVA fattura'},{label:'Imponibile fattura',key:'taxBase'},{label:'SAL residuo',key:'remaining'},{label:'Verifica'}])
 ];
 if(tab==='partial-sal')headers.push({label:'Verifica'});
 $('detailHead').innerHTML='<tr>'+headers.map(x=>{
  if(!x.key)return '<th>'+esc(x.label)+'</th>';
  const selected=detailSort.key===x.key,arrow=selected?(detailSort.dir==='asc'?'↑':'↓'):'↕';
  return '<th class="numeric" aria-sort="'+(selected?(detailSort.dir==='asc'?'ascending':'descending'):'none')+
   '"><button type="button" class="sort-head '+(selected?'is-sorted':'')+'" data-detail-sort="'+esc(x.key)+'" title="Ordina '+esc(x.label)+' per importo">'+esc(x.label)+' <span class="sort-indicator" aria-hidden="true">'+arrow+'</span></button></th>';
 }).join('')+'</tr>';
 $('detailTable').innerHTML=currentRows.slice(page*PAGE,(page+1)*PAGE).map(r=>{
  let h='<tr class="'+(isExcluded(r)?'review-excluded':'')+'"><td><strong>'+esc(r.code)+'</strong><div class="original">'+esc(r.address).slice(0,70)+'</div></td><td>'+esc(r.year||'—')+'</td><td>'+esc(r.site)+'</td><td>'+esc(r.network==='IT-Franchising'?'Franchising':'Diretta')+'</td><td>'+esc(r.state)+'</td>';
  h+=moneyTd(r.venduto)+moneyTd(r.prodotto)+moneyTd(r.fatturato)+cashTd(r);
  if(tab==='partial-sal'){
    const result=simulatedRange(r);
    const amount=result.scenario?euroC(result.max):euroC(result.min)+' – '+euroC(result.max);
    h+='<td>'+selectScenario(r)+'</td>'+taxableCell(r)+'<td class="numeric money-strong '+(result.scenario?'simulated-amount':'')+'">'+amount+'</td><td>'+selectReview(r)+'</td>';
  }else{
    h+='<td>'+esc(r.coefficient?ivaLabel(r.coefficient):'—')+'</td>'+taxableCell(r)+moneyTd(r.remaining,r.fullSal)
    +'<td>'+selectReview(r)+'</td>';
  }
  return h+'</tr>'
 }).join('')||'<tr><td colspan="13" class="empty">Nessuna pratica nei filtri selezionati.</td></tr>';
}
function recalculating(){
 if(!book)return;const data=settings();if(Object.values(data).some(x=>!Number.isFinite(x)||x<0)){err('Le tolleranze devono essere numeri non negativi.');return}
 const raw=book.sourceStore;book={...raw.finalize(data),sourceStore:raw};rowLookup=new Map(book.rows.map(r=>[r.key,r]));err('');page=0;renderAll();
}
function showScope(mode){scope=mode;focus='';page=0;renderAll()}
function exportRows(rows){return rows.map(r=>{
 const taxable=taxableBase(r);
 const data={'Commessa':r.code,'Anno delibera':r.year,'Sede':r.site,'Rete':r.network,'Società':r.company,'Macroarea':areaName(r.area),'Stato (informativo)':r.state,'Indirizzo':r.address,
 'Venduto €':r.venduto/100,'Prodotto €':r.prodotto/100,'Fatturato netto a pagare €':r.fatturato/100,
 'Imponibile fattura calcolato €':taxable&&taxable.min===taxable.max?taxable.min/100:'',
 'Imponibile fattura minimo €':taxable?taxable.min/100:'',
 'Imponibile fattura massimo €':taxable?taxable.max/100:'',
 'Criterio imponibile':taxable?taxable.origin:'Non determinabile',
 'Incassato €':r.incassato/100,
 'Trattamento incasso':r.cashMethod||'Da riconciliare',
 'Bonifico parlante compatibile':r.cashWithholdingRate?'Sì (da verificare)':'No',
 'Ritenuta bonifico compatibile %':r.cashWithholdingRate||'',
 'Ritenuta bancaria teorica €':r.cashWithholdingRate?r.bankWithholding/100:'',
 'Incasso bancario atteso post ritenuta €':r.cashWithholdingRate?r.expectedCash/100:'',
 'Nota data bonifico':r.cashWithholdingRate?'Aliquota da confermare con data dell’accredito bancario, non con data delibera':'',
 'IVA fattura compatibile':ivaLabel(r.coefficient),'SAL venduto meno prodotto €':r.remaining/100,'SAL teorico min €':r.pMin/100,'SAL teorico max €':r.pMax/100,
 'Ipotesi IVA fattura':r.scenarios.map(x=>ivaLabel(x.fx)).join(' / '),'IVA fattura simulata':selectedScenario(r)?ivaLabel(selectedScenario(r).fx):'Da simulare',
 'SAL simulato €':selectedScenario(r)?selectedScenario(r).gap/100:'',
 'SAL conteggiato dopo simulazioni min €':r.partial&&!isExcluded(r)?simulatedRange(r).min/100:0,
 'SAL conteggiato dopo simulazioni max €':r.partial&&!isExcluded(r)?simulatedRange(r).max/100:0,
 'Categoria':r.kind,'Righe aggregate':r.lines,'Righe economiche identiche':r.sameFinance?'Sì':'No',
 'Revisione':review.get(r.key)||'Da verificare','Escluso dal SAL potenziale':isExcluded(r)?'Sì':'No',
 'SAL conteggiato fatture complete €':r.fullSal&&!isExcluded(r)?r.remaining/100:0,
 'SAL conteggiato incassi parziali minimo €':r.partial&&!isExcluded(r)?simulatedRange(r).min/100:0,
 'SAL conteggiato incassi parziali massimo €':r.partial&&!isExcluded(r)?simulatedRange(r).max/100:0};
 for(const c of fx.FX){const x=r.scenarios.find(x=>x.fx===c.label);data['Base '+ivaLabel(c.label)+' €']=x?x.base/100:'';data['SAL '+ivaLabel(c.label)+' €']=x?x.gap/100:''}
 return data
})}
function summaryTable(){
 const by=new Map();
 for(const r of activeRows){if(!by.has(r.siteKey))by.set(r.siteKey,[]);by.get(r.siteKey).push(r)}
 return [...by.entries()].map(([key,rs])=>{const s=financialSummary(rs),r=rs[0];return {'Sede':r.site,'Rete':r.network,'Filtro macroarea':selectedMacroarea||'Tutte le macroaree','Filtro anno':selectedYear||'Tutti gli anni','Pratiche vendute':s.practices,'Venduto €':s.venduto/100,'Prodotto €':s.prodotto/100,'Fatturato netto a pagare €':s.fatturato/100,'Incassato €':s.incassato/100,'Pratiche SAL completo':s.fullCount,'SAL fatture complete €':s.fullSal/100,'Incassi compatibili bonifico parlante 8%':s.withholding8Count,'Incassi compatibili bonifico parlante 11%':s.withholding11Count,'Ritenuta banca teorica €':s.withholdingTotal/100,'Pratiche SAL parziale':s.partialCount,'SAL parziale min €':s.pMin/100,'SAL parziale max €':s.pMax/100,'Regimi simulati':s.chosenCount,'Pratiche da simulare':s.pendingCount,'Escluse/acconti SAL completo':s.excludedFull,'Escluse/acconti SAL parziale':s.excludedPartial,'Anomalie codici ripetuti':s.possibleRepeats}}).sort((a,b)=>b['SAL fatture complete €']-a['SAL fatture complete €'])
}
function summaryYears(){
 const by=new Map();
 for(const r of activeRows){const key=r.year||'Anno non disponibile';if(!by.has(key))by.set(key,[]);by.get(key).push(r)}
 return [...by.entries()].map(([year,rows])=>{const t=financialSummary(rows);return {'Anno delibera':year,'Filtro macroarea':selectedMacroarea||'Tutte le macroaree','Pratiche vendute':t.practices,'Venduto €':t.venduto/100,'Prodotto €':t.prodotto/100,'Fatturato netto a pagare €':t.fatturato/100,'Incassato €':t.incassato/100,'SAL su fatture complete €':t.fullSal/100,'Pratiche SAL fatture complete':t.fullCount,'Incassi compatibili bonifico parlante 8%':t.withholding8Count,'Incassi compatibili bonifico parlante 11%':t.withholding11Count,'Ritenuta banca teorica €':t.withholdingTotal/100,'SAL incassi parziali minimo €':t.pMin/100,'SAL incassi parziali massimo €':t.pMax/100,'Pratiche SAL incassi parziali':t.partialCount,'Regimi simulati':t.chosenCount,'Pratiche da simulare':t.pendingCount,'Escluse/acconti SAL completo':t.excludedFull,'Escluse/acconti SAL parziale':t.excludedPartial}})
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
 // The first sheet reflects the visible detail tab and its IVA / withholding filters.
 // Existing category and audit sheets keep the full selected site/year/macroarea perimeter.
 const tabs=[
  ['Dettaglio filtrato',exportRows(currentRows)],
  ['Riepilogo sedi',summaryTable()],
  ['Riepilogo anni',summaryYears()],
  ['SAL fatture complete',exportRows(activeRows.filter(x=>x.fullSal))],
  ['SAL su incassi parziali',exportRows(activeRows.filter(x=>x.partial))],
  ['Escluse e acconti',exportRows(activeRows.filter(x=>(x.fullSal||x.partial)&&isExcluded(x)))],
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
$('networkFilter').onchange=e=>{network=e.target.value;focus='';page=0;renderAll()};
$('macroareaFilter').onchange=e=>{selectedMacroarea=e.target.value;focus='';page=0;renderAll()};
$('yearFilter').onchange=e=>{selectedYear=e.target.value;focus='';page=0;renderAll()};
$('clearSite').onclick=()=>{selectedSites.clear();focus='';page=0;renderAll()};
$('sitePickerToggle').onclick=()=>setPickerOpen($('sitePickerPanel').hidden);
$('siteSearchInput').oninput=e=>{siteSearchTerm=e.target.value;pickerSiteOptions()};
$('siteOptions').onchange=e=>{
 const input=e.target.closest('input[data-site]');if(!input)return;
 const key=decodeURIComponent(input.dataset.site);
 if(input.checked)selectedSites.add(key);else selectedSites.delete(key);
 focus='';page=0;renderAll();
};
$('selectedChips').onclick=e=>{
 const chip=e.target.closest('button[data-remove-site]');if(!chip)return;
 selectedSites.delete(decodeURIComponent(chip.dataset.removeSite));
 focus='';page=0;renderAll();
};
document.addEventListener('click',e=>{
 if(!$('multiPicker').contains(e.target))setPickerOpen(false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('sitePickerPanel').hidden){setPickerOpen(false);$('sitePickerToggle').focus()}});

$('recalculate').onclick=recalculating;
$('siteTable').onclick=e=>{const tr=e.target.closest('tr[data-focus]');if(!tr)return;focus=tr.dataset.focus;tab='full-sal';page=0;term='';coefficient='';bankRate='';$('search').value='';$('coef').value='';$('bankRateFilter').value='';renderSites();renderTabs();renderDetails();$('tabs').scrollIntoView({behavior:'smooth',block:'start'})};
$('siteHead').onclick=e=>{
 const b=e.target.closest('button[data-site-sort]');if(!b)return;
 const key=b.dataset.siteSort;
 siteSort=siteSort.key===key?{key,dir:siteSort.dir==='asc'?'desc':'asc'}:{key,dir:'asc'};
 renderSites();
};
$('detailHead').onclick=e=>{
 const b=e.target.closest('button[data-detail-sort]');if(!b)return;
 const key=b.dataset.detailSort;
 detailSort=detailSort.key===key?{key,dir:detailSort.dir==='asc'?'desc':'asc'}:{key,dir:'asc'};
 page=0;renderDetails();
};
$('clearFocus').onclick=()=>{focus='';renderSites();renderDetails()};
$('tabs').onclick=e=>{const b=e.target.closest('button[data-tab]');if(!b)return;tab=b.dataset.tab;page=0;renderTabs();renderDetails()};
$('search').oninput=e=>{term=e.target.value.toLowerCase();page=0;renderDetails()};
$('coef').onchange=e=>{coefficient=e.target.value;page=0;renderDetails()};
$('bankRateFilter').onchange=e=>{bankRate=e.target.value;page=0;renderDetails()};
$('prev').onclick=()=>{page=Math.max(0,page-1);renderDetails()};
$('next').onclick=()=>{page++;renderDetails()};
$('detailTable').onchange=e=>{
 const choice=e.target.closest('select[data-scenario]');
 if(choice){
  const r=rowLookup.get(decodeURIComponent(choice.dataset.scenario));
  if(!r)return;
  saveScenario(r,choice.value);
  if(coefficient&&choice.value&&coefficient!==choice.value){coefficient='';$('coef').value=''}
  renderAll();
  return;
 }
 const t=e.target.closest('select[data-review]');if(!t)return;
 const r=rowLookup.get(decodeURIComponent(t.dataset.review));
 if(!r)return;
 saveReview(r,t.value);
 renderAll();
};
$('exportCSV').onclick=downloadCSV;$('exportExcel').onclick=downloadXlsx;
})();
