/* Interface do FinanSmart. Regras em finance.js, persistência em storage.js (ou firebase-adapter.js com login). */
(async () => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = [['income', 'Salário'], ['income', 'Freelance'], ['income', 'Rendimentos'], ['income', 'Outras receitas'],
  ['expense', 'Moradia'], ['expense', 'Alimentação'], ['expense', 'Transporte'], ['expense', 'Saúde'], ['expense', 'Educação'],
  ['expense', 'Lazer'], ['expense', 'Compras'], ['expense', 'Contas e serviços'], ['expense', 'Outras despesas']];
const TYPES = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência' };

let state = await Store.load();
if (!state) {
  state = { version: 1, settings: { theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' },
    accounts: [{ id: Store.uid(), name: 'Carteira', type: 'Carteira', initial: 0 }],
    categories: CATS.map(([kind, name]) => ({ id: Store.uid(), kind, name })), transactions: [] };
}
const migrate = () => {
  ['cards', 'cardTx', 'invoicePayments', 'fixed', 'investments', 'invTx', 'budgets', 'goals'].forEach(k => state[k] ||= []); // completa dados de versões anteriores
  for (const p of state.cardTx) if (!p.first) { const c = state.cards.find(x => x.id === p.cardId); if (c) p.first = Fin.invoiceKey(c, p.date); } // fixa a fatura de compras antigas
};
migrate();
const ui = { month: Fin.currentMonth(), f: { type: '', cat: '', acc: '', q: '', sort: 'date-desc' },
  fx: { cat: '', sort: 'date-asc' }, cd: { cat: '', sort: 'date-desc' } }; // fx = filtros dos fixos, cd = filtros dos cartões
const toast = (msg, ok) => { const t = $('#toast'); t.textContent = msg; t.className = ok ? 'ok' : ''; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3500); };
const save = async () => { Fin.invalidate(state); if (!(await Store.save(state))) toast('Não foi possível salvar os dados. Verifique a conexão e tente de novo.'); };
const catName = id => state.categories.find(c => c.id === id)?.name || 'Sem categoria';
const accName = id => state.accounts.find(a => a.id === id)?.name || '—';
const byDate = (a, b) => b.date.localeCompare(a.date);
const SORTS = [['date-desc', 'Data: mais recente'], ['date-asc', 'Data: mais antiga'], ['amount-desc', 'Valor: maior'], ['amount-asc', 'Valor: menor']];
const sortOpts = sel => SORTS.map(([k, v]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${v}</option>`).join('');
const sorter = (sort, getDate, getAmount) => (a, b) => { const [k, dir] = sort.split('-'), r = k === 'amount' ? getAmount(a) - getAmount(b) : getDate(a).localeCompare(getDate(b)); return dir === 'asc' ? r : -r; };
// Barra de filtro por categoria + ordenação dos Fixos e Cartões (só despesas). scope: 'fx' | 'cd'
const catSortBar = scope => {
  const f = ui[scope]; if (f.cat && !state.categories.some(c => c.id === f.cat)) f.cat = ''; // categoria excluída: limpa o filtro
  return `<div class="filters"><select data-scope="${scope}" data-k="cat" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>${state.categories.filter(c => c.kind === 'expense').map(c => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <select data-scope="${scope}" data-k="sort" aria-label="Ordenar por">${sortOpts(f.sort)}</select></div>`;
};
const money = (c, cls = '') => `<span class="${cls}">${Fin.fmt(c)}</span>`;
const applyTheme = () => document.documentElement.dataset.theme = state.settings.theme;

/* ---------- Views ---------- */
const card = (l, c, cls = '') => `<div class="card"><div class="label">${l}</div><div class="value ${cls}">${Fin.fmt(c)}</div></div>`;

function txRow(t, actions) {
  const sign = t.type === 'income' ? ['inc', '+'] : t.type === 'expense' ? ['exp', '−'] : ['', ''];
  const acc = t.type === 'transfer' ? `${esc(accName(t.accountId))} → ${esc(accName(t.toAccountId))}` : esc(accName(t.accountId));
  const cat = t.type === 'transfer' ? 'Transferência' : esc(catName(t.categoryId));
  return `<tr><td>${Fin.fmtDate(t.date)}</td><td>${esc(t.description)}${t.attachments?.length ? ` <button class="btn sm" data-action="viewAtt" data-id="${t.id}">📎${t.attachments.length}</button>` : ''}</td><td>${cat}</td><td>${acc}</td>
  <td class="r ${sign[0]}"><b>${sign[1]} ${Fin.fmt(t.amount)}</b></td>
  ${actions ? `<td class="r"><button class="btn sm" data-action="editTx" data-id="${t.id}">Editar</button> <button class="btn sm danger" data-action="delTx" data-id="${t.id}">Excluir</button></td>` : ''}</tr>`;
}
const txTable = (list, actions) => list.length
  ? `<div class="tablewrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th class="r">Valor</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>${list.map(t => txRow(t, actions)).join('')}</tbody></table></div>`
  : '<div class="empty">Nenhuma movimentação encontrada.</div>';

const views = {
  dashboard() {
    const s = Fin.monthSummary(state, ui.month), ser = Fin.series(state, ui.month, 6);
    const max = Math.max(1, ...ser.flatMap(x => [x.income, x.expense]));
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    const recent = [...state.transactions].sort(byDate).slice(0, 6);
    return `<section class="grid cards">${card('Saldo disponível', Fin.totalBalance(state))}${card('Receitas do mês', s.income, 'inc')}${card('Despesas do mês', s.expense, 'exp')}${card('Resultado do mês', s.result, s.result >= 0 ? 'inc' : 'exp')}${card('Faturas em aberto', Fin.openInvoices(state, ui.month), 'exp')}${card('Investimentos', Fin.investTotal(state, ui.month))}${card('Patrimônio líquido', Fin.netWorth(state))}</section>
    <section class="grid two">
      <div class="card"><h3>Receitas x Despesas (6 meses)</h3><div class="bars">${ser.map(x => `<div class="bargroup"><div class="barpair">
        <i class="bar" style="height:${x.income / max * 100}%" title="Receitas: ${Fin.fmt(x.income)}"></i><i class="bar e" style="height:${x.expense / max * 100}%" title="Despesas: ${Fin.fmt(x.expense)}"></i></div>${x.label}</div>`).join('')}</div>
        <div class="legend"><span class="inc">● Receitas</span><span class="exp">● Despesas</span></div></div>
      <div class="card"><h3>Despesas por categoria</h3>${cats.length ? cats.map(([id, v]) => `<div class="row"><span>${esc(catName(id))}</span><b>${Fin.fmt(v)}</b></div><div class="track"><i style="width:${v / s.expense * 100}%"></i></div>`).join('') : '<div class="empty">Sem despesas neste mês.</div>'}</div>
    </section>
    <section class="card"><h3>Últimas movimentações</h3>${txTable(recent, false)}</section>`;
  },
  movimentacoes() {
    const f = ui.f;
    return `<div class="head"><span class="sp"></span><button class="btn" data-action="importXls">⬆ Importar planilha</button><button class="btn primary" data-action="newTx">+ Nova movimentação</button></div>
    <div class="filters">
      <input data-filter="q" placeholder="Buscar descrição..." value="${esc(f.q)}">
      <select data-filter="type"><option value="">Todos os tipos</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select data-filter="cat"><option value="">Todas as categorias</option>${state.categories.map(c => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select data-filter="acc"><option value="">Todas as contas</option>${state.accounts.map(a => `<option value="${a.id}" ${f.acc === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <select data-filter="sort" aria-label="Ordenar por">${sortOpts(f.sort)}</select>
    </div><div class="card" id="txlist">${txListHtml()}</div>`;
  },
  contas() {
    return `<div class="head"><span class="sp"></span><button class="btn" data-action="transfer">⇄ Transferir</button><button class="btn primary" data-action="newAcc">+ Nova conta</button></div>
    <section class="grid cards">${state.accounts.map(a => `<div class="card"><div class="label">${esc(a.type)}</div><h3>${esc(a.name)}</h3>
      <div class="value ${Fin.balance(state, a.id) < 0 ? 'exp' : ''}">${Fin.fmt(Fin.balance(state, a.id))}</div><br>
      <button class="btn sm" data-action="editAcc" data-id="${a.id}">Editar</button> <button class="btn sm danger" data-action="delAcc" data-id="${a.id}">Excluir</button></div>`).join('') || '<div class="empty">Cadastre sua primeira conta.</div>'}</section>`;
  }
};
function txListHtml() {
  const f = ui.f, q = f.q.toLowerCase();
  const list = state.transactions.filter(t => t.date.startsWith(ui.month) && (!f.type || t.type === f.type) && (!f.cat || t.categoryId === f.cat)
    && (!f.acc || t.accountId === f.acc || t.toAccountId === f.acc) && (!q || t.description.toLowerCase().includes(q))).sort(sorter(f.sort, t => t.date, t => t.amount));
  return txTable(list, true);
}
const titles = { dashboard: 'Dashboard', movimentacoes: 'Movimentações', contas: 'Contas bancárias' };
function render() {
  Fin.invalidate(state);
  const r = views[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.r === r));
  $('#title').textContent = titles[r]; $('#eyebrow').textContent = r === 'contas' || r === 'categorias' ? 'Cadastro' : Fin.monthLabel(ui.month); $('#monthnav').hidden = r === 'contas' || r === 'categorias';
  $('#monthlabel').value = ui.month; $('#view').innerHTML = views[r]();
}

/* ---------- Modal ---------- */
function openModal(title, body, onSave, label = 'Salvar') {
  const d = $('#modal');
  d.innerHTML = `<form novalidate><h3>${title}</h3>${body}<p class="err" id="err"></p><div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">${label}</button></div></form>`;
  const f = d.querySelector('form');
  f.onsubmit = async e => {
    e.preventDefault();
    try { const msg = await onSave(new FormData(f)); if (msg) { $('#err').textContent = msg; return; } await save(); d.close(); render(); }
    catch (x) { console.error(x); $('#err').textContent = 'Erro inesperado ao salvar.'; }
  };
  d.querySelector('[data-close]').onclick = () => d.close();
  if (!MONTH_OK) f.querySelectorAll('input[type=month]').forEach(i => { i.type = 'text'; i.placeholder = 'AAAA-MM'; i.maxLength = 7; });
  d.showModal(); return f;
}
const opts = (list, sel) => list.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const accOpts = sel => opts(state.accounts.map(a => [a.id, a.name]), sel);

function txModal(t = {}, preset) {
  if (!state.accounts.length) return toast('Cadastre uma conta antes de lançar movimentações.');
  const type = t.type || preset || 'expense';
  const f = openModal(t.id ? 'Editar movimentação' : 'Nova movimentação', `
    <label>Tipo<select name="type">${opts(Object.entries(TYPES), type)}</select></label>
    <label>Descrição<input name="description" maxlength="80" value="${esc(t.description || '')}"></label>
    <label>Valor (R$)<input name="amount" inputmode="decimal" placeholder="0,00" value="${t.amount ? (t.amount / 100).toFixed(2).replace('.', ',') : ''}"></label>
    <label>Data<input type="date" name="date" value="${t.date || Fin.today()}"></label>
    <label id="lcat">Categoria<select name="categoryId"></select></label>
    <label id="lacc">Conta<select name="accountId">${accOpts(t.accountId)}</select></label>
    <label id="lto">Conta de destino<select name="toAccountId">${accOpts(t.toAccountId)}</select></label>
    <label>Comprovantes (JPEG, PNG ou PDF, até 5 MB cada)<input type="file" name="files" accept="image/jpeg,image/png,application/pdf" multiple></label>${(t.attachments || []).map(a => `<label><input type="checkbox" name="rm" value="${a.id}" style="width:auto"> Remover ${esc(a.name)}</label>`).join('')}`,
    async fd => {
      const type = fd.get('type'), amount = Fin.parseMoney(fd.get('amount')), date = fd.get('date');
      if (!amount || amount <= 0) return 'Informe um valor válido maior que zero.';
      if (!date) return 'Informe a data.';
      let desc = fd.get('description').trim();
      if (!desc && type === 'transfer') desc = 'Transferência'; if (!desc) return 'Informe a descrição.';
      const tx = { id: t.id || Store.uid(), type, description: desc, amount, date, accountId: fd.get('accountId') };
      if (t.fixedId) { tx.fixedId = t.fixedId; tx.fixedMonth = t.fixedMonth; }
      if (type === 'transfer') { tx.toAccountId = fd.get('toAccountId'); if (tx.toAccountId === tx.accountId) return 'Origem e destino devem ser contas diferentes.'; }
      else { tx.categoryId = fd.get('categoryId'); if (!tx.categoryId) return 'Selecione uma categoria.'; }
      const files = fd.getAll('files').filter(x => x && x.size), bad = files.find(x => !ATT_TYPES.includes(x.type) || x.size > ATT_MAX);
      if (bad) return `Arquivo "${bad.name}" inválido. Use JPEG, PNG ou PDF de até 5 MB.`;
      const rm = new Set(fd.getAll('rm'));
      tx.attachments = (t.attachments || []).filter(a => !rm.has(a.id));
      for (const x of files) {
        const id = Store.uid(); if ((await Store.putFile(id, x)) === false) return 'Não foi possível guardar o comprovante (armazenamento cheio?).';
        tx.attachments.push({ id, name: x.name, type: x.type, size: x.size });
      }
      for (const a of t.attachments || []) if (rm.has(a.id)) await Store.delFile(a.id);
      const i = state.transactions.findIndex(x => x.id === t.id); i >= 0 ? state.transactions[i] = tx : state.transactions.push(tx);
    });
  const sync = () => {
    const ty = f.type.value, tr = ty === 'transfer';
    f.categoryId.innerHTML = opts(state.categories.filter(c => c.kind === ty).map(c => [c.id, c.name]), t.categoryId);
    $('#lcat').hidden = tr; $('#lto').hidden = !tr; $('#lacc').firstChild.textContent = tr ? 'Conta de origem' : 'Conta';
  };
  f.type.onchange = sync; sync();
}
function accModal(a = {}) {
  openModal(a.id ? 'Editar conta' : 'Nova conta', `
    <label>Nome<input name="name" maxlength="40" value="${esc(a.name || '')}"></label>
    <label>Tipo<select name="type">${opts(['Conta corrente', 'Poupança', 'Carteira', 'Outra'].map(x => [x, x]), a.type)}</select></label>
    <label>Saldo inicial (R$)<input name="initial" inputmode="decimal" placeholder="0,00" value="${a.initial ? (a.initial / 100).toFixed(2).replace('.', ',') : ''}"></label>`,
    async fd => {
      const name = fd.get('name').trim(), raw = fd.get('initial').trim(), initial = raw ? Fin.parseMoney(raw) : 0;
      if (!name) return 'Informe o nome da conta.'; if (initial === null) return 'Saldo inicial inválido.';
      const acc = { id: a.id || Store.uid(), name, type: fd.get('type'), initial };
      const i = state.accounts.findIndex(x => x.id === a.id); i >= 0 ? state.accounts[i] = acc : state.accounts.push(acc);
    });
}

/* ---------- Eventos ---------- */
const actions = {
  prevMonth: () => { ui.month = Fin.shiftMonth(ui.month, -1); render(); },
  nextMonth: () => { ui.month = Fin.shiftMonth(ui.month, 1); render(); },
  theme: async () => { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); await save(); },
  newTx: () => txModal(), transfer: () => txModal({}, 'transfer'), newAcc: () => accModal(),
  editTx: id => txModal(state.transactions.find(t => t.id === id)),
  editAcc: id => accModal(state.accounts.find(a => a.id === id)),
  async delTx(id) { if (!confirm('Excluir esta movimentação? Esta ação não pode ser desfeita.')) return; for (const a of find(state.transactions, id)?.attachments || []) await Store.delFile(a.id); state.transactions = state.transactions.filter(t => t.id !== id); await save(); render(); },
  async delAcc(id) {
    if (state.transactions.some(t => t.accountId === id || t.toAccountId === id) || state.invoicePayments.some(p => p.accountId === id) || state.fixed.some(f => f.accountId === id) || state.invTx.some(t => t.accountId === id)) return toast('Esta conta possui movimentações. Exclua ou edite-as antes.');
    if (!confirm('Excluir esta conta?')) return; state.accounts = state.accounts.filter(a => a.id !== id); await save(); render();
  }
};
/* ---------- Etapa 2: Cartões e Gastos fixos ---------- */
titles.cartoes = 'Cartões de crédito'; titles.fixos = 'Gastos fixos';
const mv = c => c ? (c / 100).toFixed(2).replace('.', ',') : '';
const int = (v, min, max) => { const n = /^\d+$/.test(String(v).trim()) ? Number(v) : NaN; return n >= min && n <= max ? n : null; };
const expCats = sel => opts(state.categories.filter(c => c.kind === 'expense').map(c => [c.id, c.name]), sel);
const upsert = (arr, o) => { const i = arr.findIndex(x => x.id === o.id); i >= 0 ? arr[i] = o : arr.push(o); };

views.cartoes = () => {
  const head = `<div class="head"><span class="sp"></span><button class="btn" data-action="newPurchase">+ Compra no cartão</button><button class="btn primary" data-action="newCard">+ Novo cartão</button></div>`;
  if (!state.cards.length) return head + '<div class="card empty">Cadastre seu primeiro cartão de crédito.</div>';
  const cl = ui.cd, cmp = sorter(cl.sort, x => x.date, x => x.amount);
  return head + catSortBar('cd') + state.cards.map(c => {
    const inv = Fin.invoice(state, c.id, ui.month), used = Fin.cardUsed(state, c.id);
    const shown = inv.items.filter(x => !cl.cat || x.categoryId === cl.cat).sort(cmp);
    const status = inv.total === 0 ? '' : inv.open === 0 ? '<span class="pill inc">Paga</span>' : Fin.dueDate(c, ui.month) < Fin.today() ? '<span class="pill exp">Vencida</span>' : '<span class="pill">Em aberto</span>';
    return `<div class="card" style="margin-bottom:16px"><div class="head"><div class="sp"><h3 style="margin:0">${esc(c.name)}</h3><div class="label">Fecha dia ${c.closeDay} · vence dia ${c.dueDay} · limite ${Fin.fmt(c.limit)}</div></div>
      <button class="btn sm" data-action="editCard" data-id="${c.id}">Editar</button><button class="btn sm danger" data-action="delCard" data-id="${c.id}">Excluir</button></div>
      <div class="row"><span>Limite usado: <b>${Fin.fmt(used)}</b></span><span>Disponível: <b>${Fin.fmt(c.limit - used)}</b></span></div><div class="track"><i style="width:${Math.min(100, used / c.limit * 100)}%"></i></div>
      <div class="head"><div class="sp"><h3 style="margin:0">Fatura com vencimento em ${Fin.fmtDate(Fin.dueDate(c, ui.month))} ${status}</h3>
        <div class="label">Total ${Fin.fmt(inv.total)} · Pago ${Fin.fmt(inv.paid)} · Em aberto <b>${Fin.fmt(inv.open)}</b></div></div>
        <button class="btn sm" data-action="newPurchase" data-id="${c.id}">+ Compra</button>${inv.open > 0 ? `<button class="btn sm primary" data-action="payInvoice" data-id="${c.id}">Pagar fatura</button>` : ''}</div>
      ${shown.length ? `<div class="tablewrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Parcela</th><th>Categoria</th><th class="r">Valor</th><th></th></tr></thead><tbody>${shown.map(x => `<tr><td>${Fin.fmtDate(x.date)}</td><td>${esc(x.description)}</td><td>${x.n}/${x.of}</td><td>${esc(catName(x.categoryId))}</td><td class="r exp"><b>${Fin.fmt(x.amount)}</b></td>
        <td class="r"><button class="btn sm" data-action="editPurchase" data-id="${x.purchaseId}">Editar</button> <button class="btn sm danger" data-action="delPurchase" data-id="${x.purchaseId}">Excluir</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${inv.items.length ? 'Nenhuma compra desta categoria nesta fatura.' : 'Sem compras nesta fatura.'}</div>`}
      ${inv.payments.map(p => `<div class="row" style="margin-top:8px"><span>✔ Pagamento em ${Fin.fmtDate(p.date)} (${esc(accName(p.accountId))})</span><span><b>${Fin.fmt(p.amount)}</b> <button class="btn sm danger" data-action="delPayment" data-id="${p.id}">Desfazer</button></span></div>`).join('')}</div>`;
  }).join('');
};

views.fixos = () => {
  const fl = ui.fx, amountOf = f => Fin.fixedPaid(state, f, ui.month)?.amount ?? f.amount;
  const all = state.fixed.filter(f => f.start <= ui.month && (!f.end || f.end >= ui.month));
  const list = all.filter(f => !fl.cat || f.categoryId === fl.cat).sort(sorter(fl.sort, f => Fin.dueDate(f, ui.month), amountOf));
  let planned = 0, paid = 0;
  const rows = list.map(f => {
    const due = Fin.dueDate(f, ui.month), tx = Fin.fixedPaid(state, f, ui.month); planned += tx ? tx.amount : f.amount; if (tx) paid += tx.amount;
    const st = tx ? `<b class="inc">Pago em ${Fin.fmtDate(tx.date)}</b>` : due < Fin.today() ? '<b class="exp">Atrasado</b>' : 'Pendente';
    return `<tr><td>${esc(f.description)}</td><td>${esc(f.kind)}</td><td>${Fin.fmtDate(due)}</td><td>${esc(catName(f.categoryId))}</td><td class="r">${Fin.fmt(tx ? tx.amount : f.amount)}</td><td>${st}</td>
      <td class="r">${tx ? `<button class="btn sm" data-action="unpayFixed" data-id="${f.id}">Desfazer</button>` : `<button class="btn sm primary" data-action="payFixed" data-id="${f.id}">Pagar</button>`} <button class="btn sm" data-action="editFixed" data-id="${f.id}">Editar</button> <button class="btn sm danger" data-action="delFixed" data-id="${f.id}">Excluir</button></td></tr>`;
  }).join('');
  return `<div class="head"><span class="sp"></span><button class="btn primary" data-action="newFixed">+ Novo gasto fixo</button></div>
    <section class="grid cards">${card('Previsto no mês', planned)}${card('Pago', paid, 'inc')}${card('Pendente', planned - paid, 'exp')}</section>
    ${catSortBar('fx')}<div class="card">${list.length ? `<div class="tablewrap"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Vencimento</th><th>Categoria</th><th class="r">Valor</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">${all.length ? 'Nenhum gasto fixo nesta categoria.' : 'Nenhum gasto fixo neste mês.'}</div>`}</div>`;
};

function cardModal(c = {}) {
  openModal(c.id ? 'Editar cartão' : 'Novo cartão', `
    <label>Nome<input name="name" maxlength="40" value="${esc(c.name || '')}"></label>
    <label>Limite (R$)<input name="limit" inputmode="decimal" value="${mv(c.limit)}"></label>
    <label>Dia de fechamento (1–31)<input name="closeDay" inputmode="numeric" value="${c.closeDay || ''}"></label>
    <label>Dia de vencimento (1–31)<input name="dueDay" inputmode="numeric" value="${c.dueDay || ''}"></label>`, async fd => {
    const name = fd.get('name').trim(), limit = Fin.parseMoney(fd.get('limit')), closeDay = int(fd.get('closeDay'), 1, 31), dueDay = int(fd.get('dueDay'), 1, 31);
    if (!name) return 'Informe o nome do cartão.'; if (!limit || limit <= 0) return 'Informe um limite válido.';
    if (!closeDay || !dueDay) return 'Fechamento e vencimento devem ser dias entre 1 e 31.';
    upsert(state.cards, { id: c.id || Store.uid(), name, limit, closeDay, dueDay });
  });
}
function purchaseModal(p = {}, cardId) {
  if (!state.cards.length) return toast('Cadastre um cartão primeiro.');
  openModal(p.id ? 'Editar compra' : 'Compra no cartão', `
    <label>Cartão<select name="cardId">${opts(state.cards.map(c => [c.id, c.name]), p.cardId || cardId)}</select></label>
    <label>Descrição<input name="description" maxlength="80" value="${esc(p.description || '')}"></label>
    <label>Valor total (R$)<input name="total" inputmode="decimal" placeholder="0,00" value="${mv(p.total)}"></label>
    <label>Parcelas (1–48)<input name="installments" inputmode="numeric" value="${p.installments || 1}"></label>
    <label>Data da compra<input type="date" name="date" value="${p.date || Fin.today()}"></label>
    <label>Categoria<select name="categoryId">${expCats(p.categoryId)}</select></label>`, async fd => {
    const total = Fin.parseMoney(fd.get('total')), n = int(fd.get('installments'), 1, 48), description = fd.get('description').trim();
    if (!description) return 'Informe a descrição.'; if (!total || total <= 0) return 'Informe um valor válido.';
    if (!n) return 'Número de parcelas deve estar entre 1 e 48.'; if (total < n) return 'Valor muito baixo para esse número de parcelas.';
    if (!fd.get('date')) return 'Informe a data.';
    const card = state.cards.find(c => c.id === fd.get('cardId'));
    if (!card) return 'Selecione um cartão.';
    upsert(state.cardTx, { id: p.id || Store.uid(), cardId: card.id, description, total, installments: n, date: fd.get('date'), categoryId: fd.get('categoryId'), first: Fin.invoiceKey(card, fd.get('date')) });
  });
}
function payModal(cardId) {
  if (!state.accounts.length) return toast('Cadastre uma conta para pagar a fatura.');
  const ym = ui.month;
  openModal('Pagar fatura', `
    <label>Conta de pagamento<select name="accountId">${accOpts()}</select></label>
    <label>Valor (R$)<input name="amount" inputmode="decimal" value="${mv(Fin.invoice(state, cardId, ym).open)}"></label>
    <label>Data<input type="date" name="date" value="${Fin.today()}"></label>`, async fd => {
    const amount = Fin.parseMoney(fd.get('amount')), open = Fin.invoice(state, cardId, ym).open;
    if (!amount || amount <= 0) return 'Informe um valor válido.';
    if (amount > open) return `O valor excede o saldo em aberto da fatura (${Fin.fmt(open)}).`;
    if (!fd.get('date')) return 'Informe a data.';
    state.invoicePayments.push({ id: Store.uid(), cardId, invoice: ym, accountId: fd.get('accountId'), amount, date: fd.get('date') });
  });
}
function fixedModal(f = {}) {
  if (!state.accounts.length) return toast('Cadastre uma conta primeiro.');
  openModal(f.id ? 'Editar gasto fixo' : 'Novo gasto fixo', `
    <label>Descrição<input name="description" maxlength="80" value="${esc(f.description || '')}"></label>
    <label>Tipo<select name="kind">${opts(['Conta mensal', 'Assinatura'].map(x => [x, x]), f.kind)}</select></label>
    <label>Valor mensal (R$)<input name="amount" inputmode="decimal" value="${mv(f.amount)}"></label>
    <label>Dia de vencimento (1–31)<input name="dueDay" inputmode="numeric" value="${f.dueDay || ''}"></label>
    <label>Começa em<input type="month" name="start" value="${f.start || ui.month}"></label>
    <label>Termina em (opcional, para parcelas)<input type="month" name="end" value="${f.end || ''}"></label>
    <label>Categoria<select name="categoryId">${expCats(f.categoryId)}</select></label>
    <label>Conta de pagamento<select name="accountId">${accOpts(f.accountId)}</select></label>`, async fd => {
    const description = fd.get('description').trim(), amount = Fin.parseMoney(fd.get('amount')), dueDay = int(fd.get('dueDay'), 1, 31);
    if (!description) return 'Informe a descrição.'; if (!amount || amount <= 0) return 'Informe um valor válido.';
    if (!dueDay) return 'Dia de vencimento deve estar entre 1 e 31.'; if (!MONTH_RE.test(fd.get('start'))) return 'Informe o mês de início no formato AAAA-MM.'; if (fd.get('end') && !MONTH_RE.test(fd.get('end'))) return 'Mês final inválido. Use AAAA-MM.'; if (fd.get('end') && fd.get('end') < fd.get('start')) return 'O mês final não pode ser anterior ao início.';
    upsert(state.fixed, { id: f.id || Store.uid(), description, kind: fd.get('kind'), amount, dueDay, start: fd.get('start'), ...(fd.get('end') ? { end: fd.get('end') } : {}), categoryId: fd.get('categoryId'), accountId: fd.get('accountId') });
  });
}
const find = (arr, id) => arr.find(x => x.id === id);
Object.assign(actions, {
  newCard: () => cardModal(), editCard: id => cardModal(find(state.cards, id)),
  async delCard(id) {
    if (state.cardTx.some(p => p.cardId === id) || state.invoicePayments.some(p => p.cardId === id)) return toast('Este cartão possui compras ou pagamentos. Exclua-os antes.');
    if (!confirm('Excluir este cartão?')) return; state.cards = state.cards.filter(c => c.id !== id); await save(); render();
  },
  newPurchase: id => purchaseModal({}, id), editPurchase: id => purchaseModal(find(state.cardTx, id)),
  async delPurchase(id) {
    if (Fin.installments(state).some(x => x.purchaseId === id && state.invoicePayments.some(p => p.cardId === x.cardId && p.invoice === x.invoice))) return toast('Há pagamento de fatura ligado a esta compra. Desfaça o pagamento antes de excluir.');
    if (!confirm('Excluir esta compra e todas as suas parcelas?')) return; state.cardTx = state.cardTx.filter(p => p.id !== id); await save(); render(); },
  payInvoice: id => payModal(id),
  async delPayment(id) { if (!confirm('Desfazer este pagamento? O valor volta para a conta.')) return; state.invoicePayments = state.invoicePayments.filter(p => p.id !== id); await save(); render(); },
  newFixed: () => fixedModal(), editFixed: id => fixedModal(find(state.fixed, id)),
  async delFixed(id) { if (!confirm('Excluir este gasto fixo? Os pagamentos já lançados serão mantidos nas movimentações.')) return; state.fixed = state.fixed.filter(f => f.id !== id); await save(); render(); },
  async payFixed(id) {
    const f = find(state.fixed, id); if (!find(state.accounts, f.accountId)) return toast('A conta deste gasto não existe mais. Edite o gasto fixo.');
    state.transactions.push({ id: Store.uid(), type: 'expense', description: f.description, amount: f.amount, date: Fin.dueDate(f, ui.month), accountId: f.accountId, categoryId: f.categoryId, fixedId: f.id, fixedMonth: ui.month });
    await save(); render();
  },
  async unpayFixed(id) { const f = find(state.fixed, id); state.transactions = state.transactions.filter(t => !(t.fixedId === f.id && t.fixedMonth === ui.month)); await save(); render(); }
});
/* ---------- Etapa 3: Investimentos, Orçamentos e Metas ---------- */
titles.investimentos = 'Investimentos'; titles.planejamento = 'Orçamentos e metas';
const ASSET_TYPES = ['Renda fixa', 'Ações', 'Fundos', 'FIIs', 'Cripto', 'Poupança', 'Outro'];
const KINDS = { aporte: 'Aporte', resgate: 'Resgate', rendimento: 'Rendimento' };
const pct = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
const assetName = id => find(state.investments, id)?.name || '—';

views.investimentos = () => {
  const ym = ui.month, mine = state.invTx.filter(t => t.date.startsWith(ym)).sort(byDate);
  const sum = k => mine.filter(t => t.kind === k).reduce((s, t) => s + t.amount, 0);
  const ser = Array.from({ length: 6 }, (_, i) => { const k = Fin.shiftMonth(ym, i - 5); return { label: Fin.monthLabel(k, true), v: Fin.investTotal(state, k) }; });
  const max = Math.max(1, ...ser.map(x => x.v));
  const rows = state.investments.map(a => { const s = Fin.assetStats(state, a.id, ym); return `<tr><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td class="r">${Fin.fmt(s.aportes)}</td><td class="r">${Fin.fmt(s.resgates)}</td>
    <td class="r ${s.rendimentos < 0 ? 'exp' : 'inc'}">${Fin.fmt(s.rendimentos)}</td><td class="r"><b>${Fin.fmt(s.value)}</b></td><td class="r ${s.pct < 0 ? 'exp' : 'inc'}">${pct(s.pct)}</td>
    <td class="r"><button class="btn sm primary" data-action="moveInv" data-id="${a.id}">Movimentar</button> <button class="btn sm" data-action="editAsset" data-id="${a.id}">Editar</button> <button class="btn sm danger" data-action="delAsset" data-id="${a.id}">Excluir</button></td></tr>`; }).join('');
  return `<div class="head"><span class="sp"></span><button class="btn" data-action="newAsset">+ Novo ativo</button><button class="btn primary" data-action="moveInv">+ Movimentar</button></div>
  <section class="grid cards">${card('Total investido (fim do mês)', Fin.investTotal(state, ym))}${card('Aportes do mês', sum('aporte'))}${card('Resgates do mês', sum('resgate'))}${card('Rendimentos do mês', sum('rendimento'), sum('rendimento') < 0 ? 'exp' : 'inc')}</section>
  <section class="grid two"><div class="card"><h3>Evolução do patrimônio investido</h3><div class="bars">${ser.map(x => `<div class="bargroup"><div class="barpair"><i class="bar p" style="height:${x.v / max * 100}%" title="${Fin.fmt(x.v)}"></i></div>${x.label}</div>`).join('')}</div></div>
  <div class="card"><h3>Movimentações do mês</h3>${mine.length ? `<div class="tablewrap"><table><tbody>${mine.map(t => `<tr><td>${Fin.fmtDate(t.date)}</td><td>${esc(assetName(t.assetId))}</td><td>${KINDS[t.kind]}</td><td class="r ${t.amount < 0 ? 'exp' : ''}"><b>${Fin.fmt(t.amount)}</b></td><td class="r"><button class="btn sm danger" data-action="delInv" data-id="${t.id}">Excluir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sem movimentações neste mês.</div>'}</div></section>
  <section class="card"><h3>Ativos</h3>${state.investments.length ? `<div class="tablewrap"><table><thead><tr><th>Ativo</th><th>Tipo</th><th class="r">Aportes</th><th class="r">Resgates</th><th class="r">Rendimentos</th><th class="r">Valor atual</th><th class="r">Rentab.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Cadastre seu primeiro ativo.</div>'}
  <p class="label">Aportes e resgates movem dinheiro entre conta e investimento, sem virar despesa. Rentabilidade = rendimentos ÷ aportes.</p></section>`;
};

views.planejamento = () => {
  const spent = Fin.monthSummary(state, ui.month).byCat;
  const bud = state.budgets.map(b => { const s = spent[b.categoryId] || 0, p = s / b.limit * 100; return { b, s, p }; });
  const tl = bud.reduce((x, y) => x + y.b.limit, 0), ts = bud.reduce((x, y) => x + y.s, 0);
  const today = Fin.today();
  return `<div class="head"><h3 class="sp" style="margin:0">Orçamentos do mês</h3><button class="btn primary" data-action="newBudget">+ Orçamento</button></div>
  ${bud.length ? `<section class="grid cards">${card('Orçado', tl)}${card('Gasto', ts, ts > tl ? 'exp' : '')}${card('Restante', tl - ts, tl - ts < 0 ? 'exp' : 'inc')}</section>` : ''}
  <div class="card">${bud.map(({ b, s, p }) => `<div class="row"><span><b>${esc(catName(b.categoryId))}</b> ${p > 100 ? '<span class="pill exp">Estourado</span>' : p >= 80 ? '<span class="pill">Atenção</span>' : ''}</span>
    <span>${Fin.fmt(s)} / ${Fin.fmt(b.limit)} (${Math.round(p)}%) <button class="btn sm" data-action="editBudget" data-id="${b.id}">Editar</button> <button class="btn sm danger" data-action="delBudget" data-id="${b.id}">Excluir</button></span></div>
    <div class="track"><i class="${p > 100 ? 'over' : p >= 80 ? '' : 'ok'}" style="width:${Math.min(100, p)}%"></i></div>`).join('') || '<div class="empty">Defina limites mensais por categoria de despesa.</div>'}</div>
  <div class="head" style="margin-top:24px"><h3 class="sp" style="margin:0">Metas financeiras</h3><button class="btn primary" data-action="newGoal">+ Meta</button></div>
  <section class="grid two">${state.goals.map(g => {
    const saved = Fin.goalSaved(g), rem = Math.max(0, g.target - saved), p = Math.min(100, Math.max(0, saved / g.target * 100)); let info = '';
    if (rem === 0) info = '<b class="inc">Meta atingida 🎉</b>';
    else if (g.deadline) { const [dy, dm] = g.deadline.split('-').map(Number), [ty, tm] = today.split('-').map(Number), left = (dy - ty) * 12 + dm - tm;
      info = g.deadline < today ? '<b class="exp">Prazo vencido</b>' : `Prazo ${Fin.fmtDate(g.deadline)} · guardar <b>${Fin.fmt(Math.ceil(rem / Math.max(1, left)))}</b>/mês`; }
    return `<div class="card"><div class="row"><h3 style="margin:0">${esc(g.name)}</h3><b>${Math.round(p)}%</b></div><div class="label">Guardado ${Fin.fmt(saved)} de ${Fin.fmt(g.target)} · faltam ${Fin.fmt(rem)}</div>
      <div class="track" style="margin-top:10px"><i class="ok" style="width:${p}%"></i></div><div class="label">${info}</div><br>
      <button class="btn sm primary" data-action="goalDeposit" data-id="${g.id}">Guardar / retirar</button> <button class="btn sm" data-action="editGoal" data-id="${g.id}">Editar</button> <button class="btn sm danger" data-action="delGoal" data-id="${g.id}">Excluir</button></div>`; }).join('') || '<div class="card empty">Crie uma meta, como reserva de emergência ou viagem.</div>'}</section>
  <p class="label">Os valores das metas são uma reserva virtual: não alteram o saldo das contas.</p>`;
};

function assetModal(a = {}) {
  openModal(a.id ? 'Editar ativo' : 'Novo ativo', `<label>Nome<input name="name" maxlength="50" value="${esc(a.name || '')}"></label><label>Tipo<select name="type">${opts(ASSET_TYPES.map(x => [x, x]), a.type)}</select></label>`, async fd => {
    const name = fd.get('name').trim(); if (!name) return 'Informe o nome do ativo.';
    upsert(state.investments, { id: a.id || Store.uid(), name, type: fd.get('type') });
  });
}
function invModal(assetId, kind = 'aporte') {
  if (!state.investments.length) return toast('Cadastre um ativo primeiro.');
  const f = openModal('Movimentar investimento', `
    <label>Ativo<select name="assetId">${opts(state.investments.map(a => [a.id, a.name]), assetId)}</select></label>
    <label>Tipo<select name="kind">${opts(Object.entries(KINDS), kind)}</select></label>
    <label>Valor (R$) — em rendimentos, use negativo para perda<input name="amount" inputmode="decimal" placeholder="0,00"></label>
    <label>Data<input type="date" name="date" value="${Fin.today()}"></label>
    <label id="linv">Conta<select name="accountId">${accOpts()}</select></label>`, async fd => {
    const kind = fd.get('kind'), assetId = fd.get('assetId'), amount = Fin.parseMoney(fd.get('amount'));
    if (!amount) return 'Informe um valor válido.'; if (!fd.get('date')) return 'Informe a data.';
    if (kind !== 'rendimento') { if (amount <= 0) return 'Informe um valor maior que zero.'; if (!state.accounts.length) return 'Cadastre uma conta primeiro.'; }
    if (kind === 'resgate' && amount > Fin.assetStats(state, assetId).value) return `Resgate maior que o valor atual do ativo (${Fin.fmt(Fin.assetStats(state, assetId).value)}).`;
    state.invTx.push({ id: Store.uid(), assetId, kind, amount, date: fd.get('date'), accountId: kind === 'rendimento' ? null : fd.get('accountId') });
  });
  const sync = () => $('#linv').hidden = f.kind.value === 'rendimento'; f.kind.onchange = sync; sync();
}
function budgetModal(b = {}) {
  openModal(b.id ? 'Editar orçamento' : 'Novo orçamento', `<label>Categoria<select name="categoryId">${expCats(b.categoryId)}</select></label><label>Limite mensal (R$)<input name="limit" inputmode="decimal" value="${mv(b.limit)}"></label>`, async fd => {
    const limit = Fin.parseMoney(fd.get('limit')), categoryId = fd.get('categoryId');
    if (!limit || limit <= 0) return 'Informe um limite válido.';
    if (state.budgets.some(x => x.categoryId === categoryId && x.id !== b.id)) return 'Já existe um orçamento para esta categoria.';
    upsert(state.budgets, { id: b.id || Store.uid(), categoryId, limit });
  });
}
function goalModal(g = {}) {
  openModal(g.id ? 'Editar meta' : 'Nova meta', `<label>Nome<input name="name" maxlength="60" value="${esc(g.name || '')}"></label><label>Valor da meta (R$)<input name="target" inputmode="decimal" value="${mv(g.target)}"></label><label>Prazo (opcional)<input type="date" name="deadline" value="${g.deadline || ''}"></label>`, async fd => {
    const name = fd.get('name').trim(), target = Fin.parseMoney(fd.get('target'));
    if (!name) return 'Informe o nome da meta.'; if (!target || target <= 0) return 'Informe um valor válido.';
    upsert(state.goals, { id: g.id || Store.uid(), name, target, deadline: fd.get('deadline') || '', deposits: g.deposits || [] });
  });
}
function depositModal(g) {
  openModal('Guardar / retirar — ' + esc(g.name), `<label>Operação<select name="op"><option value="1">Guardar</option><option value="-1">Retirar</option></select></label><label>Valor (R$)<input name="amount" inputmode="decimal" placeholder="0,00"></label><label>Data<input type="date" name="date" value="${Fin.today()}"></label>`, async fd => {
    const amount = Fin.parseMoney(fd.get('amount')), sign = Number(fd.get('op'));
    if (!amount || amount <= 0) return 'Informe um valor válido.'; if (!fd.get('date')) return 'Informe a data.';
    if (sign < 0 && amount > Fin.goalSaved(g)) return 'Retirada maior que o valor guardado.';
    g.deposits.push({ id: Store.uid(), date: fd.get('date'), amount: sign * amount });
  });
}
Object.assign(actions, {
  newAsset: () => assetModal(), editAsset: id => assetModal(find(state.investments, id)), moveInv: id => invModal(id),
  async delAsset(id) {
    if (state.invTx.some(t => t.assetId === id)) return toast('Este ativo possui movimentações. Exclua-as antes.');
    if (!confirm('Excluir este ativo?')) return; state.investments = state.investments.filter(a => a.id !== id); await save(); render();
  },
  async delInv(id) {
    if (!confirm('Excluir esta movimentação de investimento? Os saldos serão recalculados.')) return;
    const rest = state.invTx.filter(t => t.id !== id);
    if (state.investments.some(a => { let v = 0; rest.filter(t => t.assetId === a.id).forEach(t => v += t.kind === 'resgate' ? -t.amount : t.amount); return v < 0; })) return toast('Não é possível: o valor do ativo ficaria negativo.');
    state.invTx = rest; await save(); render();
  },
  newBudget: () => budgetModal(), editBudget: id => budgetModal(find(state.budgets, id)),
  async delBudget(id) { if (!confirm('Excluir este orçamento?')) return; state.budgets = state.budgets.filter(b => b.id !== id); await save(); render(); },
  newGoal: () => goalModal(), editGoal: id => goalModal(find(state.goals, id)), goalDeposit: id => depositModal(find(state.goals, id)),
  async delGoal(id) { if (!confirm('Excluir esta meta e todo o valor guardado nela?')) return; state.goals = state.goals.filter(g => g.id !== id); await save(); render(); }
});

/* ---------- Etapa 4: Importação de planilhas e comprovantes ---------- */
const ATT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'], ATT_MAX = 5 * 1024 * 1024;
function importModal() {
  if (!state.accounts.length) return toast('Cadastre uma conta antes de importar.');
  let rows = null;
  const readMap = f => ({ date: +f.cDate.value, desc: +f.cDesc.value, amount: +f.cAmount.value, type: +f.cType.value, cat: +f.cCat.value, invert: f.invert.checked, accountId: f.accountId.value, fixed: f.cFixed ? +f.cFixed.value : -1, end: f.cEnd ? +f.cEnd.value : -1 });
  const f = openModal('Importar planilha', `
    <p class="label">Aceita .xlsx (primeira aba) e .csv, com cabeçalho na primeira linha. Sem coluna de tipo, valor negativo = despesa. <button type="button" class="btn sm" data-action="tplCsv">Baixar modelo</button></p>
    <label>Arquivo<input type="file" name="file" accept=".xlsx,.csv,.txt"></label>
    <label>Conta de destino<select name="accountId">${accOpts()}</select></label><div id="imp"></div>`, async () => {
    if (!rows) return 'Selecione um arquivo.';
    const m = readMap(f); if (m.date < 0 || m.desc < 0 || m.amount < 0) return 'Associe as colunas Data, Descrição e Valor.';
    const res = Importer.mapRows(state, rows, m); if (!res.items.length) return 'Nenhuma linha válida para importar.';
    state.transactions.push(...res.items); state.fixed.push(...res.fixed); toast(`${res.items.length} movimentações importadas${res.fixed.length ? ` e ${res.fixed.length} gastos fixos criados` : ''}.`, true);
  });
  const prev = () => {
    if (!rows || !$('#prev')) return; const r = Importer.mapRows(state, rows, readMap(f));
    $('#prev').innerHTML = `<p class="label"><b>${r.items.length}</b> válidas · ${r.fixed.length ? `${r.fixed.length} novos gastos fixos · ` : ''}${r.dups} já existentes (ignoradas) · ${r.bad} inválidas (ignoradas)</p>` + (r.items.length ? `<div class="tablewrap"><table><tbody>${r.items.slice(0, 5).map(t => `<tr><td>${Fin.fmtDate(t.date)}</td><td>${esc(t.description)}</td><td class="r ${t.type === 'income' ? 'inc' : 'exp'}">${Fin.fmt(t.amount)}</td></tr>`).join('')}</tbody></table></div>` : '');
  };
  f.file.onchange = async () => {
    const file = f.file.files[0]; rows = null; $('#imp').innerHTML = ''; $('#err').textContent = ''; if (!file) return;
    try { rows = await Importer.read(file); } catch (e) { $('#err').textContent = e.message; return; }
    if (rows.length < 2) { rows = null; $('#err').textContent = 'A planilha está vazia ou só tem o cabeçalho.'; return; }
    const d = Importer.detect(rows[0].map(Importer.norm));
    const sel = (name, label, idx, optional) => `<label>${label}<select name="${name}">${optional ? '<option value="-1">— não usar —</option>' : ''}${rows[0].map((x, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${esc(x || 'Coluna ' + (i + 1))}</option>`).join('')}</select></label>`;
    $('#imp').innerHTML = sel('cDate', 'Coluna da data', d.date) + sel('cDesc', 'Coluna da descrição', d.desc) + sel('cAmount', 'Coluna do valor', d.amount) + sel('cType', 'Coluna do tipo (opcional: receita/despesa, crédito/débito)', d.type, true) + sel('cCat', 'Coluna da categoria (opcional)', d.cat, true) + sel('cFixed', 'Coluna "fixo" (opcional: Sim = gasto fixo recorrente)', d.fixed, true) + sel('cEnd', 'Coluna do último mês do fixo (opcional, MM/AAAA)', d.end, true)
      + '<label><input type="checkbox" name="invert" style="width:auto"> Inverter sinal (positivo = despesa)</label><div id="prev"></div>';
    prev();
  };
  f.addEventListener('change', prev);
}
Object.assign(actions, {
  importXls: () => importModal(),
  tplCsv() {
    const a = document.createElement('a'); a.download = 'modelo-finansmart.csv';
    a.href = URL.createObjectURL(new Blob(['\uFEFFData;Descrição;Valor;Categoria\n05/10/2026;Mercado;-150,00;Alimentação\n10/10/2026;Salário;3500,00;Salário\n'], { type: 'text/csv' })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  viewAtt(id) {
    const t = find(state.transactions, id), d = $('#modal');
    d.innerHTML = `<form method="dialog"><h3>Comprovantes</h3>${t.attachments.map(a => `<div class="row"><span>📎 ${esc(a.name)} <span class="label">(${Math.max(1, Math.round(a.size / 1024))} KB)</span></span><button type="button" class="btn sm primary" data-action="openAtt" data-id="${a.id}">Abrir</button></div>`).join('')}<div class="actions"><button class="btn">Fechar</button></div></form>`;
    d.showModal();
  },
  async openAtt(id) {
    const w = window.open('', '_blank'); // abre antes do await: depois dele o navegador (Safari/celular) pode bloquear o popup
    const blob = await Store.getFile(id); if (!blob) { w?.close(); return toast('Arquivo não encontrado neste navegador.'); }
    const url = URL.createObjectURL(blob);
    if (w) w.location.href = url; else { const a = document.createElement('a'); a.href = url; a.download = find(state.transactions.find(t => t.attachments?.some(x => x.id === id)).attachments, id).name; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
});

/* ---------- Etapa 5: Relatórios, projeção e backup ---------- */
titles.relatorios = 'Relatórios';
views.relatorios = () => {
  const ym = ui.month, s = Fin.monthSummary(state, ym), hist = Fin.series(state, ym, 12), proj = Fin.projection(state, 6);
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...hist.flatMap(x => [x.income, x.expense])), pmax = Math.max(1, ...proj.map(r => Math.abs(r.balance)));
  const sg = c => `<span class="${c < 0 ? 'neg' : ''}">${Fin.fmt(c)}</span>`;
  return `<div class="head noprint"><span class="label sp">Para salvar em PDF, clique em Gerar PDF e escolha "Salvar como PDF" na janela de impressão.</span><button class="btn primary" data-action="printReport">🖨 Gerar PDF</button></div>
  <h2 class="printonly">FinanSmart — Relatório de ${Fin.monthLabel(ym)}</h2>
  <section class="grid cards">${card('Receitas', s.income, 'inc')}${card('Despesas', s.expense, 'exp')}${card('Resultado', s.result, s.result >= 0 ? 'inc' : 'exp')}${card('Patrimônio líquido', Fin.netWorth(state))}</section>
  <section class="card" style="margin-bottom:16px"><h3>Histórico dos últimos 12 meses</h3>
    <div class="bars">${hist.map(x => `<div class="bargroup"><div class="barpair"><i class="bar" style="height:${x.income / max * 100}%"></i><i class="bar e" style="height:${x.expense / max * 100}%"></i></div>${x.label}</div>`).join('')}</div>
    <div class="tablewrap"><table><thead><tr><th>Mês</th><th class="r">Receitas</th><th class="r">Despesas</th><th class="r">Resultado</th></tr></thead><tbody>${hist.slice().reverse().map(x => `<tr><td style="text-transform:capitalize">${Fin.monthLabel(x.ym)}</td><td class="r">${Fin.fmt(x.income)}</td><td class="r">${Fin.fmt(x.expense)}</td><td class="r">${sg(x.income - x.expense)}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="card" style="margin-bottom:16px"><h3>Gastos por categoria — ${Fin.monthLabel(ym)}</h3>${cats.length ? cats.map(([id, v]) => `<div class="row"><span>${esc(catName(id))}</span><span><b>${Fin.fmt(v)}</b> · ${(v / s.expense * 100).toFixed(1).replace('.', ',')}%</span></div><div class="track"><i style="width:${v / s.expense * 100}%"></i></div>`).join('') : '<div class="empty">Sem despesas neste mês.</div>'}</section>
  <section class="card"><h3>Projeção de fluxo de caixa (6 meses)</h3>
    <div class="tablewrap"><table><thead><tr><th>Mês</th><th class="r">Receitas estimadas</th><th class="r">Fixos pendentes</th><th class="r">Faturas de cartão</th><th class="r">Variáveis estimadas</th><th class="r">Resultado</th><th class="r">Saldo projetado</th></tr></thead><tbody>${proj.map(r => `<tr><td style="text-transform:capitalize">${Fin.monthLabel(r.ym)}</td><td class="r">${Fin.fmt(r.income)}</td><td class="r">${Fin.fmt(r.fixed)}</td><td class="r">${Fin.fmt(r.invoices)}</td><td class="r">${Fin.fmt(r.variable)}</td><td class="r">${sg(r.result)}</td><td class="r"><b>${sg(r.balance)}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="bars" style="height:120px;margin-top:14px">${proj.map(r => `<div class="bargroup"><div class="barpair"><i class="bar ${r.balance < 0 ? 'e' : 'p'}" style="height:${Math.abs(r.balance) / pmax * 100}%" title="${Fin.fmt(r.balance)}"></i></div>${Fin.monthLabel(r.ym, true)}</div>`).join('')}</div>
    <p class="label">Parte do saldo atual das contas. O mês atual considera só compromissos conhecidos (fixos pendentes e faturas em aberto, inclusive vencidas). Os meses seguintes somam a média dos últimos 3 meses de receitas e de despesas variáveis. É uma estimativa, não uma garantia.</p></section>`;
};

const toBlob = url => { const [h, b] = url.split(','), bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: h.match(/:(.*?);/)[1] }); };
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
function backupModal() {
  const cloud = !$('#logout').hidden; // logado no Firebase: restaurar mexe na conta inteira
  openModal('Backup dos dados', `
    <p class="label">Último backup: <b>${state.settings.lastBackup ? Fin.fmtDate(state.settings.lastBackup) : 'nunca'}</b>. O arquivo inclui todos os dados e os comprovantes. Guarde-o em local seguro.${cloud ? '' : ' Os dados ficam só neste navegador.'}</p>
    <p><button type="button" class="btn primary" data-action="exportBackup">⬇ Exportar backup (.json)</button></p>
    <label>Restaurar a partir de um arquivo de backup<input type="file" name="file" accept=".json,application/json"></label>
    <p class="label">Restaurar substitui todos os dados atuais ${cloud ? 'da sua conta, em todos os seus dispositivos' : 'deste navegador'}.</p>`, async fd => {
    const file = fd.get('file'); if (!file || !file.size) return 'Selecione um arquivo de backup para restaurar.';
    let data; try { data = JSON.parse(await file.text()); } catch { return 'Arquivo inválido: não é um JSON.'; }
    const s = data?.state;
    if (data?.app !== 'finansmart' || !s || !['accounts', 'categories', 'transactions'].every(k => Array.isArray(s[k])) || !['cards', 'cardTx', 'invoicePayments', 'fixed', 'investments', 'invTx', 'budgets', 'goals'].every(k => s[k] === undefined || Array.isArray(s[k]))) return 'Este arquivo não é um backup do FinanSmart.';
    if (!confirm(cloud ? 'Restaurar este backup vai SUBSTITUIR todos os dados da sua conta, em todos os dispositivos. Continuar?' : 'Restaurar este backup vai SUBSTITUIR todos os dados atuais. Continuar?')) return 'Restauração cancelada.';
    for (const t of state.transactions) for (const a of t.attachments || []) await Store.delFile(a.id);
    for (const [id, url] of Object.entries(data.files || {})) await Store.putFile(id, toBlob(url));
    state = s; state.settings ||= { theme: 'light' }; migrate(); applyTheme(); toast('Backup restaurado.', true);
  }, 'Restaurar');
}
Object.assign(actions, {
  backup: () => backupModal(),
  async exportBackup() {
    const files = {};
    for (const t of state.transactions) for (const a of t.attachments || []) { const b = await Store.getFile(a.id); if (b) files[a.id] = await toDataUrl(b); }
    state.settings.lastBackup = Fin.today(); await save();
    const a = document.createElement('a'); a.download = `finansmart-backup-${Fin.today()}.json`;
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'finansmart', version: 1, exportedAt: new Date().toISOString(), state, files })], { type: 'application/json' }));
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Backup exportado.', true);
  },
  printReport() { const t = document.title; document.title = `FinanSmart-relatorio-${ui.month}`; window.print(); document.title = t; }
});

/* ---------- Categorias personalizadas ---------- */
titles.categorias = 'Categorias';
const catUse = id => state.transactions.filter(t => t.categoryId === id).length + state.cardTx.filter(p => p.categoryId === id).length + state.fixed.filter(f => f.categoryId === id).length + state.budgets.filter(b => b.categoryId === id).length;
const isDefaultCat = c => c.name.startsWith('Outras'); // "Outras..." é o destino padrão de importações e exclusões: não se edita nem exclui
views.categorias = () => {
  const sec = (kind, label) => `<div class="card"><h3>${label}</h3>${state.categories.filter(c => c.kind === kind).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(c =>
    `<div class="row" style="margin-bottom:12px"><span>${esc(c.name)} <span class="label">${catUse(c.id)} uso(s)</span></span><span>${isDefaultCat(c) ? '<span class="pill">Padrão</span>' : `<button class="btn sm" data-action="editCat" data-id="${c.id}">Editar</button> <button class="btn sm danger" data-action="delCat" data-id="${c.id}">Excluir</button>`}</span></div>`).join('')}</div>`;
  return `<div class="head"><span class="sp"></span><button class="btn primary" data-action="newCat">+ Nova categoria</button></div><section class="grid two">${sec('expense', 'Despesas')}${sec('income', 'Receitas')}</section>`;
};
function catModal(c = {}) {
  openModal(c.id ? 'Editar categoria' : 'Nova categoria', `<label>Nome<input name="name" maxlength="30" value="${esc(c.name || '')}"></label>${c.id ? '' : `<label>Tipo<select name="kind">${opts([['expense', 'Despesa'], ['income', 'Receita']], 'expense')}</select></label>`}`, async fd => {
    const name = fd.get('name').trim(), kind = c.id ? c.kind : fd.get('kind');
    if (!name) return 'Informe o nome da categoria.';
    if (/^outras/.test(Importer.norm(name))) return 'Nomes iniciados em "Outras" são reservados.';
    if (state.categories.some(x => x.kind === kind && x.id !== c.id && Importer.norm(x.name) === Importer.norm(name))) return 'Já existe uma categoria com esse nome.';
    upsert(state.categories, { id: c.id || Store.uid(), kind, name });
  });
}
Object.assign(actions, {
  newCat: () => catModal(),
  editCat(id) { const c = find(state.categories, id); if (c && !isDefaultCat(c)) catModal(c); },
  async delCat(id) {
    const c = find(state.categories, id); if (!c) return;
    const fb = state.categories.find(x => x.kind === c.kind && x.id !== id && isDefaultCat(x));
    if (isDefaultCat(c) || !fb) return toast('Esta categoria não pode ser excluída.');
    const n = catUse(id), nb = state.budgets.filter(b => b.categoryId === id).length;
    if (!confirm(n ? `Esta categoria é usada em ${n} item(ns). Eles serão movidos para "${fb.name}"${nb ? ' e o orçamento dela será removido' : ''}. Continuar?` : 'Excluir esta categoria?')) return;
    for (const list of [state.transactions, state.cardTx, state.fixed]) for (const x of list) if (x.categoryId === id) x.categoryId = fb.id;
    state.budgets = state.budgets.filter(b => b.categoryId !== id); state.categories = state.categories.filter(x => x.id !== id);
    await save(); render();
  }
});

/* ---------- Seletor de mês (Firefox/Safari desktop não têm input month) ---------- */
const MONTH_OK = (() => { const i = document.createElement('input'); i.type = 'month'; return i.type === 'month'; })();
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ml = $('#monthlabel'); if (!MONTH_OK) { ml.type = 'text'; ml.placeholder = 'AAAA-MM'; ml.maxLength = 7; ml.size = 8; }
ml.addEventListener('change', e => { if (MONTH_RE.test(e.target.value)) ui.month = e.target.value; render(); });

document.addEventListener('click', e => { const el = e.target.closest('[data-action]'); if (el) actions[el.dataset.action]?.(el.dataset.id); });
document.addEventListener('input', e => {
  const sc = e.target.dataset.scope; if (sc && ui[sc]) { ui[sc][e.target.dataset.k] = e.target.value; render(); return; }
  const k = e.target.dataset.filter; if (!k) return;
  ui.f[k] = e.target.value; $('#txlist').innerHTML = txListHtml();
});
window.addEventListener('hashchange', render);
applyTheme(); await save(); render(); document.body.dataset.ready = '1';
})();
