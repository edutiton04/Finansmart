/* Adaptador Firebase (Auth + Firestore). Mesma interface do armazenamento local: load() e save(state).
   Script comum (não módulo): o SDK é carregado por import() dinâmico, então o index.html continua abrindo sem servidor.
   Estrutura: users/{uid}/meta/settings e users/{uid}/{colecao}/{id} (um documento por item).
   Só itens alterados são gravados (compara com o último estado confirmado), para poupar a cota gratuita. */
async function createFirebaseAdapter(cfg) {
  const base = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const [{ initializeApp }, A, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const COLS = ['accounts', 'categories', 'transactions', 'cards', 'cardTx', 'invoicePayments', 'fixed', 'investments', 'invTx', 'budgets', 'goals'];
  const SYNC_WAIT = 4000; // sem confirmação do servidor nesse tempo (offline), a escrita fica na fila local e a tela não trava
  const app = initializeApp(cfg), auth = A.getAuth(app);
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  let last = {}; // fotografia (JSON por documento) do que o servidor já tem
  const uid = () => { if (!auth.currentUser) throw new Error('Sem login.'); return auth.currentUser.uid; };
  return {
    onUser: cb => A.onAuthStateChanged(auth, cb),
    signIn: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    signUp: (e, p) => A.createUserWithEmailAndPassword(auth, e, p),
    resetPassword: e => A.sendPasswordResetEmail(auth, e),
    async signOut() {
      await A.signOut(auth);
      try { await F.terminate(db); await F.clearIndexedDbPersistence(db); } catch (e) { console.warn('Não foi possível limpar o cache local', e); } // não deixa dados financeiros no navegador
    },
    async load() { // lança erro se falhar (nunca devolve null por falha), para não criar dados iniciais por cima dos reais
      const u = uid(), meta = await F.getDoc(F.doc(db, 'users', u, 'meta', 'settings')); last = {};
      if (!meta.exists()) return null; // conta nova
      const snaps = await Promise.all(COLS.map(c => F.getDocs(F.collection(db, 'users', u, c)))); // coleções em paralelo
      const state = { version: 1, settings: meta.data() };
      COLS.forEach((c, i) => { state[c] = []; last[c] = {}; snaps[i].forEach(d => { state[c].push(d.data()); last[c][d.id] = JSON.stringify(d.data()); }); });
      return state;
    },
    async save(state) {
      const prevLast = last;
      try {
        const u = uid(), ops = [b => b.set(F.doc(db, 'users', u, 'meta', 'settings'), state.settings || {})], nextLast = {};
        for (const c of COLS) {
          const prev = prevLast[c] || {}, now = {};
          for (const it of state[c] || []) { const j = JSON.stringify(it); now[it.id] = j; if (prev[it.id] !== j) ops.push(b => b.set(F.doc(db, 'users', u, c, it.id), JSON.parse(j))); }
          for (const id of Object.keys(prev)) if (!(id in now)) ops.push(b => b.delete(F.doc(db, 'users', u, c, id)));
          nextLast[c] = now;
        }
        const commits = [];
        for (let i = 0; i < ops.length; i += 450) { const b = F.writeBatch(db); ops.slice(i, i + 450).forEach(f => f(b)); commits.push(b.commit()); }
        const all = Promise.all(commits).then(() => true); all.catch(() => {}); // evita "unhandled rejection" se perder a corrida abaixo
        const confirmed = await Promise.race([all, new Promise(r => setTimeout(() => r(false), SYNC_WAIT))]);
        last = nextLast; // só avança depois que o commit não falhou (um erro cai no catch e mantém a fotografia anterior)
        if (!confirmed) all.catch(e => { console.error('Escrita pendente falhou', e); if (last === nextLast) last = prevLast; }); // reenvia a diferença no próximo salvamento
        return true;
      } catch (e) { console.error('Erro ao salvar no Firebase', e); return false; }
    }
  };
}
