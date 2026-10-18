/* Leitura de planilhas sem bibliotecas: .xlsx (ZIP + XML) e .csv. Lógica pura, sem tela. */
const Importer = (() => {
  const u16 = (d, o) => d.getUint16(o, true), u32 = (d, o) => d.getUint32(o, true);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  async function inflate(bytes) {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function unzip(buf) {
    const d = new DataView(buf), u8 = new Uint8Array(buf); let e = buf.byteLength - 22;
    while (e >= 0 && u32(d, e) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Arquivo .xlsx inválido.');
    const n = u16(d, e + 10); let p = u32(d, e + 16); const files = {};
    for (let i = 0; i < n; i++) {
      const method = u16(d, p + 10), csize = u32(d, p + 20), nl = u16(d, p + 28), xl = u16(d, p + 30), cl = u16(d, p + 32), lh = u32(d, p + 42);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const start = lh + 30 + u16(d, lh + 26) + u16(d, lh + 28);
      files[name] = { method, raw: u8.subarray(start, start + csize) };
    }
    return files;
  }
  const text = async f => new TextDecoder().decode(f.method === 0 ? f.raw : await inflate(f.raw));

  async function readXlsx(file) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não lê .xlsx. Salve a planilha como CSV e tente de novo.');
    const files = await unzip(await file.arrayBuffer()), parse = s => new DOMParser().parseFromString(s, 'application/xml');
    const sheet = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
    if (!sheet) throw new Error('Nenhuma planilha encontrada no arquivo.');
    const shared = files['xl/sharedStrings.xml'] ? [...parse(await text(files['xl/sharedStrings.xml'])).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    const rows = [];
    for (const c of parse(await text(files[sheet])).getElementsByTagName('c')) {
      const [, col, row] = c.getAttribute('r').match(/^([A-Z]+)(\d+)$/), t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent;
      let val = null;
      if (t === 's') val = shared[Number(v)];
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else if (t === 'str' || t === 'b' || t === 'e') val = v;
      else if (v !== undefined) val = Number(v);
      (rows[Number(row) - 1] ||= [])[col.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1] = val;
    }
    return rows.filter(Boolean).map(r => Array.from(r, x => x ?? ''));
  }
  function readCsv(txt) {
    txt = txt.replace(/^\uFEFF/, ''); const first = txt.split(/\r?\n/)[0] || '';
    const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  async function read(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 10 MB).');
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx') return readXlsx(file);
    if (ext === 'xls') throw new Error('O formato antigo .xls não é suportado. Salve como .xlsx ou CSV.');
    if (ext === 'csv' || ext === 'txt') {
      const buf = await file.arrayBuffer(); let t = new TextDecoder('utf-8').decode(buf);
      if (t.includes('\uFFFD')) t = new TextDecoder('windows-1252').decode(buf);
      return readCsv(t);
    }
    throw new Error('Formato não suportado. Use .xlsx ou .csv.');
  }

  const toMoney = v => typeof v === 'number' ? Math.round(v * 100) : Fin.parseMoney(v);
  function toDate(v) {
    let y, m, d;
    if (typeof v === 'number') { if (v < 20000 || v > 80000) return null; const dt = new Date(Math.round((v - 25569) * 86400000)); [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]; }
    else {
      const s = String(v).trim(), a = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/), b = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (a) [d, m, y] = a.slice(1).map(Number); else if (b) [y, m, d] = b.slice(1).map(Number); else return null;
    }
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const detect = h => { const f = re => h.findIndex(x => re.test(x)); return { date: f(/data|date/), desc: f(/descri|hist|estab|lancamento|memo/), amount: f(/valor|amount|quantia/), type: f(/^tipo|type|natureza/), cat: f(/categor/), fixed: f(/^fixo|recorrente/), end: f(/^ate$|^fim|termina/) }; };

  // m = { date, desc, amount, type, cat (índices de coluna, -1 = não usar), invert, accountId }
  function mapRows(state, rows, m) {
    const out = { items: [], fixed: [], bad: 0, dups: 0 }, last = new Map(); // fixed: novos gastos fixos criados pela importação
    const yes = v => /^(s|sim|x|1|true|fixo)$/.test(norm(v)), ymOf = v => { const a = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{4})$/), b = String(v ?? '').trim().match(/^(\d{4})-(\d{2})$/); return a ? `${a[2]}-${a[1].padStart(2, '0')}` : b ? b[0] : ''; };
    const existing = new Set(state.transactions.filter(t => t.accountId === m.accountId).map(t => `${t.date}|${t.amount}|${t.type}|${t.description.toLowerCase()}`));
    for (const r of rows.slice(1)) {
      const date = toDate(r[m.date]), cents = toMoney(r[m.amount]), description = String(r[m.desc] ?? '').trim();
      if (!date || !cents || !description) { out.bad++; continue; }
      let type;
      if (m.type >= 0) { const t = norm(r[m.type]); type = /rece|cred|entrada|^c$/.test(t) ? 'income' : /desp|deb|saida|^d$/.test(t) ? 'expense' : null; if (!type) { out.bad++; continue; } }
      else type = (cents < 0) !== !!m.invert ? 'expense' : 'income';
      const amount = Math.abs(cents);
      if (existing.has(`${date}|${amount}|${type}|${description.toLowerCase()}`)) { out.dups++; continue; }
      const cn = m.cat >= 0 ? norm(r[m.cat]) : '';
      const cat = state.categories.find(c => c.kind === type && norm(c.name) === cn) || state.categories.find(c => c.kind === type && c.name.startsWith('Outras'));
      const item = { id: Store.uid(), type, description, amount, date, accountId: m.accountId, categoryId: cat?.id };
      if (m.fixed >= 0 && type === 'expense' && yes(r[m.fixed])) { // linha marcada como gasto fixo: cria (ou reaproveita) o fixo e liga o lançamento ao mês
        const ym = date.slice(0, 7), key = norm(description);
        let fx = out.fixed.find(x => norm(x.description) === key) || (state.fixed || []).find(x => norm(x.description) === key && x.accountId === m.accountId);
        if (fx && (state.transactions.some(t => t.fixedId === fx.id && t.fixedMonth === ym) || out.items.some(t => t.fixedId === fx.id && t.fixedMonth === ym))) { out.dups++; continue; }
        if (!fx) { fx = { id: Store.uid(), description, kind: 'Conta mensal', amount, dueDay: Number(date.slice(8)), start: ym, categoryId: cat?.id, accountId: m.accountId }; out.fixed.push(fx); last.set(fx.id, ym); }
        else if (out.fixed.includes(fx)) { if (ym < fx.start) fx.start = ym; if (ym > last.get(fx.id)) { last.set(fx.id, ym); fx.amount = amount; } }
        const end = m.end >= 0 ? ymOf(r[m.end]) : ''; if (end && out.fixed.includes(fx)) fx.end = end;
        item.fixedId = fx.id; item.fixedMonth = ym;
      }
      out.items.push(item);
    }
    return out;
  }
  return { read, mapRows, detect, norm };
})();
