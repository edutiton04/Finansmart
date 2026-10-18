/* Camada de armazenamento. A interface só usa Store.load()/Store.save().
   Para migrar ao Firebase: crie um adapter com os mesmos dois métodos
   (load/save, assíncronos) lendo/gravando em users/{uid}/... no Firestore
   e chame Store.use(firebaseAdapter) após o login. Nada mais muda. */
const Store = (() => {
  const KEY = 'finansmart:v1';
  const localAdapter = {
    async load() {
      try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; }
      catch (e) { console.error('Erro ao ler dados', e); return null; }
    },
    async save(data) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
      catch (e) { console.error('Erro ao salvar dados', e); return false; }
    }
  };
  // Arquivos (comprovantes) ficam no IndexedDB: o localStorage tem limite de ~5 MB. No estado vai só o metadado.
  const openDb = () => new Promise((res, rej) => { const r = indexedDB.open('finansmart-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const fileOp = async (mode, fn) => {
    try { const db = await openDb(); return await new Promise((res, rej) => { const tx = db.transaction('files', mode), req = fn(tx.objectStore('files')); tx.oncomplete = () => res(req.result); tx.onerror = () => rej(tx.error); }); }
    catch (e) { console.error('Erro no armazenamento de arquivos', e); return false; }
  };
  let adapter = localAdapter;
  return {
    use(a) { adapter = a; },
    load: () => adapter.load(),
    save: d => adapter.save(d),
    putFile: (id, blob) => fileOp('readwrite', s => s.put(blob, id)),
    getFile: id => fileOp('readonly', s => s.get(id)),
    delFile: id => fileOp('readwrite', s => s.delete(id)),
    uid: () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
  };
})();
