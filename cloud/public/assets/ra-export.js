/* SALCheck V4 – compact offline RA export. No edits to financial logic, declarations or database. */
(function(root){
'use strict';
const MONEY_KEYS=new Set(['Venduto €','Prodotto €','Fatturato €','Incassato €','Imponibile €','SAL minimo €','SAL massimo €']);
const safeText=value=>{
 const s=String(value??'');
 // An Albert field is external input. Never interpret it as an Excel formula.
 return /^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s;
};
const cents=n=>Number.isFinite(n)?n/100:'';
const normEmail=s=>String(s||'').trim().toLowerCase();
const validEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
function recipients(rows){
 return [...new Set(rows.map(r=>normEmail(r.ra)).filter(validEmail))].sort((a,b)=>a.localeCompare(b));
}
function filterRecipient(rows,email){
 const selected=normEmail(email);
 if(!validEmail(selected))throw Error('Seleziona una email RA valida.');
 return rows.filter(r=>normEmail(r.ra)===selected);
}
// Values are supplied by the exact same V2 functions used to render the browser table.
function visibleRecord(r,{iva='',taxable=null,range=null,saved=null}={}){
 const min=range?range.min:null,max=range?range.max:null;
 const same=taxable&&taxable.min===taxable.max;
 return {
  'Commessa':safeText(r.code),
  'Indirizzo':safeText(r.address||''),
  'Anno':safeText(r.year||''),
  'Sede':safeText(r.site),
  'Stato':safeText(r.state||''),
  'Venduto €':cents(r.venduto),
  'Prodotto €':cents(r.prodotto),
  'Fatturato €':cents(r.fatturato),
  'Incassato €':cents(r.incassato),
  'IVA fattura':safeText(iva),
  'Imponibile €':same?cents(taxable.min):taxable?safeText('Da '+cents(taxable.min).toLocaleString('it-IT')+' a '+cents(taxable.max).toLocaleString('it-IT')):'',
  'SAL minimo €':cents(min),
  'SAL massimo €':cents(max),
  'Esito salvato':safeText(saved?.status||'Da verificare'),
  'Verifica RA (compilare)':'',
  'Note RA (compilare)':''
 };
}
function makeWorkbook(XLSX,{recipient,summary,sites,visible,full,partial,viewLabel,source,generatedAt}){
 if(!XLSX?.utils?.book_new)throw Error('Modulo Excel non caricato.');
 const wb=XLSX.utils.book_new();
 const headings=[
  ['SALCHECK V4 · REPORT PER RESPONSABILE AREA'],
  ['Destinatario RA',safeText(recipient)],
  ['Origine dati',safeText(source||'CSV Albert pubblicato')],
  ['Generato il',safeText(generatedAt||new Date().toLocaleString('it-IT'))],
  ['Ambito della vista',safeText(viewLabel||'Pratiche selezionate')],
  ['COME UTILIZZARLO','Verifica le commesse e compila le ultime due colonne. Restituisci il file al responsabile. Le risposte Excel non si sincronizzano automaticamente con SALCheck.'],
  [],
  ['CRUSCOTTO ECONOMICO'],
  ['Pratiche vendute',summary.practices],
  ['Venduto',cents(summary.venduto)],
  ['Fatturate e incassate',summary.paid],
  ['SAL fatture complete',cents(summary.fullSal)],
  ['SAL parziali minimo',cents(summary.pMin)],
  ['SAL parziali massimo',cents(summary.pMax)],
  ['Pratiche SAL completo',summary.fullCount],
  ['Pratiche SAL parziale',summary.partialCount],
  [],
  ['CLASSIFICA SEDI'],
  ['Sede','Rete','Pratiche','SAL fatture complete €','SAL parziali min €','SAL parziali max €']
 ];
 for(const x of sites)headings.push([safeText(x.site),safeText(x.network),x.practices,cents(x.fullSal),cents(x.pMin),cents(x.pMax)]);
 const sh=XLSX.utils.aoa_to_sheet(headings);
 sh['!cols']=[{wch:34},{wch:44},{wch:16},{wch:27},{wch:27},{wch:27}];
 sh['!merges']=[{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:5,c:1},e:{r:5,c:5}}];
 sh['!rows']=[{hpt:32},null,null,null,null,{hpt:36}];
 for(const index of [9,11,12,13]){
  const a=sh['B'+(index+1)];
  if(a&&typeof a.v==='number')a.z='#,##0.00" €"';
 }
 for(let ri=19;ri<headings.length;ri++){
  for(const ci of [3,4,5]){
   const key=String.fromCharCode(65+ci)+(ri+1);
   if(sh[key]&&typeof sh[key].v==='number')sh[key].z='#,##0.00" €"';
  }
 }
 if(sites.length)sh['!autofilter']={ref:'A19:F'+headings.length};
 XLSX.utils.book_append_sheet(wb,sh,'Riepilogo');
 const columns=Object.keys(visible[0]||full[0]||partial[0]||visibleRecord({}));
 function addDetails(name,rows){
  const data=rows.length?rows:[Object.fromEntries(columns.map(k=>[k,'']))];
  const sheet=XLSX.utils.json_to_sheet(data,{header:columns,skipHeader:false});
  sheet['!cols']=columns.map(k=>({wch:k==='Indirizzo'?39:k.startsWith('Note RA')?37:k.startsWith('Verifica RA')?24:k==='Commessa'?21:k==='Esito salvato'?24:k==='IVA fattura'?25:k==='Stato'?24:MONEY_KEYS.has(k)?17:15}));
  sheet['!rows']=[{hpt:32}];
  if(rows.length)sheet['!autofilter']={ref:'A1:P'+(rows.length+1)};
  for(let ri=2;ri<=rows.length+1;ri++){
   for(const [ci,key] of columns.entries()){
    if(!MONEY_KEYS.has(key))continue;
    const col=XLSX.utils.encode_col(ci),cell=sheet[col+ri];
    if(cell&&typeof cell.v==='number')cell.z='#,##0.00" €"';
   }
  }
  XLSX.utils.book_append_sheet(wb,sheet,name);
 }
 addDetails('Vista attuale',visible);
 addDetails('SAL fatture complete',full);
 addDetails('SAL incassi parziali',partial);
 return wb;
}
function safeName(email){
 return normEmail(email).replace(/[^a-z0-9._-]/g,'_').slice(0,70);
}
root.SALRAExport={recipients,filterRecipient,visibleRecord,makeWorkbook,safeName};
})(typeof window!=='undefined'?window:globalThis);
