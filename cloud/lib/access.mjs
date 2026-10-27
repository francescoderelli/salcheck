// Email dichiarata, senza verifica, come richiesto dal proprietario.
const directors=new Set(['g.naso','j.rossi','r.pancani','s.muzio','g.digristina'].map(name=>name+'@acrobaticagroup.com'));
export const isDirector=email=>directors.has(email);
// Operational Direction: verified Sites owner identity, never an email-only claim.
export const isOperationalDirection=user=>user.role==='operational_director';
export const canManageAllPractices=user=>user.role==='manager'||isOperationalDirection(user);
export const allSites=user=>canManageAllPractices(user)||user.role==='director';
