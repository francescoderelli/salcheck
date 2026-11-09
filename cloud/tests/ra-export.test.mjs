import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function browserModule(path){
 const context={};vm.runInNewContext(readFileSync(new URL(path,import.meta.url),'utf8'),context);
 return context;
}
const helper=browserModule('../public/assets/ra-export.js').SALRAExport;
const row=(code,ra)=>({code,ra,year:'2026',site:'Brescia',network:'IT-Dirette',state:'In esecuzione',
 address:'Via Esempio 12',venduto:1000000,prodotto:600000,fatturato:1100000,incassato:1100000});
test('RA export filters by exact normalized recipient; rejects unassigned identities and spreadsheet formulas',()=>{
 const rows=[row('FIRST','RA@EXAMPLE.TEST'),row('PRIVATE','other@example.test'),row('MISSING','RA da verificare')];
 assert.deepEqual(Array.from(helper.recipients(rows)),['other@example.test','ra@example.test']);
 const only=helper.filterRecipient(rows,'RA@example.test');
 assert.equal(only.length,1);
 assert.equal(only[0].code,'FIRST');
 assert.throws(()=>helper.filterRecipient(rows,'RA da verificare'));
 const record=helper.visibleRecord({...row('=SUM(1,1)','ra@example.test'),address:'@evil'},{
  iva:'IVA 10%',taxable:{min:1000000,max:1000000},range:{min:400000,max:400000},
  saved:{status:'SAL da caricare'}
 });
 assert.equal(record.Commessa,"'=SUM(1,1)");
 assert.equal(record.Indirizzo,"'@evil");
 assert.equal(record['SAL minimo €'],4000);
 assert.equal(record['SAL massimo €'],4000);
 assert.equal(record['Esito salvato'],'SAL da caricare');
 assert.equal(record['Note RA (compilare)'],'');
 assert.equal(Object.keys(record).length,16);
});
test('RA Excel opens in SheetJS with numeric currency, filter, summary and no foreign RA practice',()=>{
 const sandbox={};
 vm.runInNewContext(readFileSync(new URL('../public/assets/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);
 const XLSX=sandbox.XLSX;
 assert.ok(XLSX?.read&&XLSX?.write,'SheetJS bundle should be usable without external downloads');
 const own=row('MY-PRACTICE','ra@example.test'),other=row('PRIVATE','other@example.test');
 const selected=helper.filterRecipient([own,other],'ra@example.test');
 const visible=selected.map(r=>helper.visibleRecord(r,{
  iva:'IVA 10%',taxable:{min:1000000,max:1000000},range:{min:400000,max:400000}
 }));
 const wb=helper.makeWorkbook(XLSX,{
  recipient:'ra@example.test',summary:{practices:1,venduto:1000000,paid:1,fullSal:400000,
   pMin:0,pMax:0,fullCount:1,partialCount:0},
  sites:[{site:'Brescia',network:'IT-Dirette',practices:1,fullSal:400000,pMin:0,pMax:0}],
  visible,full:visible,partial:[],viewLabel:'SAL fatture complete',source:'Albert DEMO',
  generatedAt:'09/11/2026 10:30'
 });
 assert.deepEqual(Array.from(wb.SheetNames),['Riepilogo','Vista attuale','SAL fatture complete','SAL incassi parziali']);
 const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array'});
 const loaded=XLSX.read(bytes,{type:'array'});
 const details=XLSX.utils.sheet_to_json(loaded.Sheets['Vista attuale']);
 assert.equal(details.length,1);
 assert.equal(details[0].Commessa,'MY-PRACTICE');
 assert.equal(details[0]['SAL minimo €'],4000);
 assert.equal(details[0]['Venduto €'],10000);
 assert.equal(details[0]['IVA fattura'],'IVA 10%');
 assert.equal(loaded.Sheets['Vista attuale']['!ref'],'A1:P2');
 assert.ok(loaded.Sheets['Vista attuale']['!autofilter']);
 const summary=XLSX.utils.sheet_to_json(loaded.Sheets.Riepilogo,{header:1});
 assert.ok(summary.flat().includes('CRUSCOTTO ECONOMICO'));
 assert.ok(summary.flat().includes('CLASSIFICA SEDI'));
 const dump=JSON.stringify(details)+JSON.stringify(summary);
 assert.ok(!dump.includes('PRIVATE'));
 assert.ok(!dump.includes('other@example.test'));
});
test('V4 report exposes both exports and a recipient selector while retaining the original technical download',()=>{
 const html=readFileSync(new URL('../public/report.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/report-v2.js',import.meta.url),'utf8');
 for(const fragment of ['id="exportRA"','id="exportExcel"','id="exportRecipient"','/assets/ra-export.js'])
  assert.ok(html.includes(fragment),fragment);
 for(const fragment of ['downloadRaXlsx()','function downloadXlsx()','filterRecipient(scopeRows,recipient)',
 "const visible=currentRows.filter"])
  assert.ok(js.includes(fragment),fragment);
});
