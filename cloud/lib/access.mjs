// Email dichiarata, senza verifica, come richiesto dal proprietario.
const directors=new Set(['g.naso','j.rossi','r.pancani','s.muzio','g.digristina'].map(name=>name+'@acrobaticagroup.com'));
export const isDirector=email=>directors.has(email);
export const allSites=user=>user.role==='manager'||user.role==='director';
