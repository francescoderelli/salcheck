const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(__dirname,'../email');fs.mkdirSync(target,{recursive:true});
fs.cpSync(path.join(__dirname,'public'),target,{recursive:true});fs.cpSync(path.join(__dirname,'assets'),path.join(target,'assets'),{recursive:true});
console.log('Interfaccia GitHub Pages aggiornata. Nessun dato aziendale incluso.');
