/* SALCheck V2 — motore economico, senza dati inviati a server */
(function(root){
"use strict";
const FX=[{v:1,label:"100%"},{v:1.06,label:"106%"},{v:1.10,label:"110%"},{v:1.18,label:"118%"},{v:1.22,label:"122%"}];
const n=x=>{if(typeof x==="number")return x;let s=String(x??"").trim().replace(/[€\s]/g,"");if(!s)return 0;if(s.includes(",")&&s.includes("."))s=s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");else if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");return Number(s)};
const cent=x=>Math.round((Number(x)+Number.EPSILON)*100);
const close=(a,b,t)=>Math.abs(a-b)<=t;
function yearFromDate(date,code){
 const d=String(date??"").trim();
 let m=/^(20\d{2})[-/]/.exec(d);if(m)return m[1];
 m=/^\d{1,2}[-/]\d{1,2}[-/](20\d{2})/.exec(d);if(m)return m[1];
 m=/^(\d{2})IT/.exec(String(code||""));return m?"20"+m[1]:"";
}
function rowFromRaw(x){const value=k=>n(x[k]);return {
  code:String(x.CodiceCommessa||"").trim(),year:yearFromDate(x.DataCreazionePratica,x.CodiceCommessa),site:String(x.Sede||"").trim(),network:String(x.CountryRete||"Non indicata").trim(),
  company:String(x.CodiceSocieta||"").trim(),area:String(x.macroarea||"").trim(),
  state:String(x.StatoPratica||"").trim(),address:String(x.Indirizzo||"").trim(),
  venduto:cent(value("Venduto€")),prodotto:cent(value("ProdottoLordo€")),
  fatturato:cent(value("FatturatoTotale€")),incassato:cent(value("IncassatoTotale€"))
}}
function store(){
 const map=new Map(),siteList=new Map();let allRows=0,invalid=0,rowsWithSale=0;
 function add(raw){
  allRows++;
  const r=rowFromRaw(raw);
  if(!r.code||!r.site||![r.venduto,r.prodotto,r.fatturato,r.incassato].every(Number.isFinite)){invalid++;return}
  const sk=r.network+"\u001f"+r.site,site=siteList.get(sk)||{key:sk,code:r.site,network:r.network,area:new Set(),company:new Set(),raw:0,withSale:0};
  site.raw++;if(r.venduto>0){site.withSale++;rowsWithSale++}if(r.area)site.area.add(r.area);if(r.company)site.company.add(r.company);siteList.set(sk,site);
  if(!r.venduto&&!r.prodotto&&!r.fatturato&&!r.incassato)return;
  const key=sk+"\u001f"+r.code;
  let group=map.get(key);
  if(!group){group={key,siteKey:sk,code:r.code,year:r.year,yearConflict:false,site:r.site,network:r.network,company:r.company,area:r.area,address:r.address,state:r.state,
    sold:0,produced:0,invoiced:0,collected:0,lines:0,lineFinance:[],states:new Set(),sameFinance:false,signatures:new Set()};map.set(key,group)}
  group.sold+=r.venduto;group.produced+=r.prodotto;group.invoiced+=r.fatturato;group.collected+=r.incassato;group.lines++;
  if(!group.year&&r.year)group.year=r.year;else if(group.year&&r.year&&group.year!==r.year)group.yearConflict=true;
  group.states.add(r.state);if(!group.address&&r.address)group.address=r.address;
  if(!group.company&&r.company)group.company=r.company;
  const sig=[r.venduto,r.prodotto,r.fatturato,r.incassato].join("/");
  if(group.signatures.has(sig)&&(r.venduto||r.prodotto||r.fatturato||r.incassato))group.sameFinance=true;
  group.signatures.add(sig);group.lineFinance.push([r.venduto,r.fatturato,r.prodotto,r.incassato]);
 }
 function finalize({invoiceTolerance=1,cashTolerance=.02,minSal=1}={}){
  const invoiceTol=cent(invoiceTolerance),cashTol=cent(cashTolerance),min=cent(minSal);const rows=[];
  for(const g of map.values()){
   if(g.sold<=0)continue;
   const invoiceMatches=FX.map(f=>({fx:f,delta:g.invoiced-cent((g.sold/100)*f.v)})).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta));
   const fullAggregate=g.invoiced>0&&close(invoiceMatches[0].delta,0,invoiceTol);
   const saleLines=g.lineFinance.filter(x=>x[0]>0);
   const allLineMatch=saleLines.length===g.lineFinance.length&&saleLines.length>1&&saleLines.every(x=>x[1]>0&&FX.some(f=>close(x[1],cent((x[0]/100)*f.v),invoiceTol/Math.max(1,saleLines.length))));
   const full=fullAggregate||allLineMatch;
   const lineFx=allLineMatch?[...new Set(saleLines.map(x=>FX.map(f=>({fx:f,delta:Math.abs(x[1]-cent((x[0]/100)*f.v))})).sort((a,b)=>a.delta-b.delta)[0].fx.label))].join(" + "):"";
   const coefficient=fullAggregate?invoiceMatches[0].fx.label:(allLineMatch?lineFx:"");
   const cashOk=g.invoiced>0&&close(g.invoiced,g.collected,cashTol);
   const paid=full&&cashOk;
   const remaining=g.sold-g.produced;
   const fullSal=paid&&remaining>min;
   const scenarios=FX.map(f=>{
    const inferred=cent((g.invoiced/100)/f.v);return {fx:f.label,base:inferred,gap:Math.max(0,inferred-g.produced)}
   }).filter(x=>g.invoiced>0&&x.base>0&&x.base<=g.sold+invoiceTol);
   const partial=!full&&cashOk&&scenarios.some(x=>x.gap>min);
   const pMin=scenarios.length?Math.min(...scenarios.map(x=>x.gap)):0,pMax=scenarios.length?Math.max(...scenarios.map(x=>x.gap)):0;
   const kind=fullSal?"full-sal":partial?"partial-sal":paid?"fully-paid":full?"invoiced-unpaid":"other";
   rows.push({
    key:g.key,siteKey:g.siteKey,code:g.code,year:g.year,yearConflict:g.yearConflict,site:g.site,network:g.network,company:g.company,area:g.area,
    address:g.address,state:[...g.states].filter(Boolean).join(", "),venduto:g.sold,prodotto:g.produced,fatturato:g.invoiced,incassato:g.collected,
    lines:g.lines,duplicate:g.lines>1,sameFinance:g.sameFinance,coefficient,full,paid,cashOk,remaining,fullSal,partial,scenarios,pMin,pMax,
    kind
   })
  }
  return {rows,sites:[...siteList.values()].map(x=>({...x,area:[...x.area],company:[...x.company]})),stats:{allRows,invalid,rowsWithSale,groups:rows.length},settings:{invoiceTolerance,cashTolerance,minSal}}
 }
 return {add,finalize}
}
function summary(rows){
 const total={practices:rows.length,venduto:0,prodotto:0,fatturato:0,incassato:0,fullCount:0,fullSal:0,partialCount:0,pMin:0,pMax:0,paid:0,invoice:0,unpaid:0,unmatched:0,multiRows:0,possibleRepeats:0};
 for(const r of rows){
  total.venduto+=r.venduto;total.prodotto+=r.prodotto;total.fatturato+=r.fatturato;total.incassato+=r.incassato;
  if(r.full)total.invoice++;if(r.paid)total.paid++;if(r.fullSal){total.fullCount++;total.fullSal+=r.remaining}
  if(r.partial){total.partialCount++;total.pMin+=r.pMin;total.pMax+=r.pMax}
  if(r.kind==="invoiced-unpaid")total.unpaid++;
  if(r.kind==="other")total.unmatched++;
  if(r.duplicate)total.multiRows++;
  if(r.sameFinance)total.possibleRepeats++;
 }
 return total;
}
root.SALCore={FX,cent,n,store,summary};
})(typeof window!=="undefined"?window:globalThis);
