/* Regras financeiras puras (sem DOM). Todos os valores em CENTAVOS (inteiros). */
const _instCache = new WeakMap(); // parcelas calculadas uma vez por estado; Fin.invalidate(state) depois de qualquer alteração
const Fin = {
  parseMoney(str) {
    let s = String(str ?? '').trim().replace(/[R$\s]/g, '');
    const neg = s.startsWith('-'); if (neg) s = s.slice(1);
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const m = s.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!m) return null;
    const c = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
    return neg ? -c : c;
  },
  fmt: c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  fmtDate(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; },
  today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  currentMonth() { return Fin.today().slice(0, 7); },
  shiftMonth(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
  monthLabel(ym, short) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', short ? { month: 'short' } : { month: 'long', year: 'numeric' }); },

  // Saldo = inicial + receitas − despesas ± transferências
  balance(state, accId) {
    const a = state.accounts.find(x => x.id === accId); if (!a) return 0;
    let b = a.initial;
    for (const t of state.transactions) {
      if (t.type === 'income' && t.accountId === accId) b += t.amount;
      else if (t.type === 'expense' && t.accountId === accId) b -= t.amount;
      else if (t.type === 'transfer') { if (t.accountId === accId) b -= t.amount; if (t.toAccountId === accId) b += t.amount; }
    }
    for (const p of state.invoicePayments || []) if (p.accountId === accId) b -= p.amount; // pagamento de fatura: saída da conta, NÃO é despesa
    // Investimentos: aporte sai da conta, resgate volta. Não são despesas nem receitas.
    for (const t of state.invTx || []) if (t.accountId === accId) { if (t.kind === 'aporte') b -= t.amount; else if (t.kind === 'resgate') b += t.amount; }
    return b;
  },
  totalBalance: state => state.accounts.reduce((s, a) => s + Fin.balance(state, a.id), 0),

  // Transferências NÃO entram em receitas/despesas.
  monthSummary(state, ym) {
    let income = 0, expense = 0; const byCat = {};
    for (const t of state.transactions) {
      if (!t.date.startsWith(ym)) continue;
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') { expense += t.amount; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; }
    }
    // Cartão: a despesa é reconhecida por parcela, no mês da fatura. O pagamento da fatura não conta de novo.
    for (const x of Fin.installments(state)) if (x.invoice === ym) { expense += x.amount; byCat[x.categoryId] = (byCat[x.categoryId] || 0) + x.amount; }
    return { income, expense, result: income - expense, byCat };
  },
  series(state, ym, n = 6) {
    return Array.from({ length: n }, (_, i) => {
      const k = Fin.shiftMonth(ym, i - n + 1), s = Fin.monthSummary(state, k);
      return { ym: k, label: Fin.monthLabel(k, true), income: s.income, expense: s.expense };
    });
  },

  /* ---- Etapa 2: cartões e gastos fixos ---- */
  // Fatura identificada pelo mês de VENCIMENTO. Compra após o dia de fechamento vai para a fatura seguinte.
  invoiceKey(card, iso) {
    const [y, m, d] = iso.split('-').map(Number); let ym = `${y}-${String(m).padStart(2, '0')}`;
    if (d > card.closeDay) ym = Fin.shiftMonth(ym, 1);
    if (card.dueDay <= card.closeDay) ym = Fin.shiftMonth(ym, 1);
    return ym;
  },
  dueDate(item, ym) { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(Math.min(item.dueDay, new Date(y, m, 0).getDate())).padStart(2, '0')}`; },
  splitInstallments(total, n) { const base = Math.floor(total / n), rest = total - base * n; return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0)); },
  invalidate: state => _instCache.delete(state),
  installments(state) {
    const hit = _instCache.get(state); if (hit) return hit;
    const out = [];
    for (const p of state.cardTx || []) {
      const card = state.cards.find(c => c.id === p.cardId); if (!card) continue;
      const first = p.first || Fin.invoiceKey(card, p.date); // p.first: fatura gravada na compra; mudar fechamento/vencimento do cartão não move compras antigas
      Fin.splitInstallments(p.total, p.installments).forEach((amount, i) => out.push({ purchaseId: p.id, cardId: p.cardId, invoice: Fin.shiftMonth(first, i), amount, n: i + 1, of: p.installments, description: p.description, categoryId: p.categoryId, date: p.date }));
    }
    _instCache.set(state, out); return out;
  },
  invoice(state, cardId, ym) {
    const items = Fin.installments(state).filter(x => x.cardId === cardId && x.invoice === ym);
    const payments = (state.invoicePayments || []).filter(p => p.cardId === cardId && p.invoice === ym);
    const total = items.reduce((s, x) => s + x.amount, 0), paid = payments.reduce((s, p) => s + p.amount, 0);
    return { items, payments, total, paid, open: Math.max(0, total - paid) };
  },
  cardUsed(state, cardId) {
    const t = Fin.installments(state).filter(x => x.cardId === cardId).reduce((s, x) => s + x.amount, 0);
    const p = (state.invoicePayments || []).filter(x => x.cardId === cardId).reduce((s, x) => s + x.amount, 0);
    return Math.max(0, t - p);
  },
  openInvoices: (state, ym) => state.cards.reduce((s, c) => s + Fin.invoice(state, c.id, ym).open, 0),
  fixedPaid: (state, f, ym) => state.transactions.find(t => t.fixedId === f.id && t.fixedMonth === ym),

  /* ---- Etapa 3: investimentos e metas ---- */
  // valor = aportes − resgates + rendimentos (rendimento pode ser negativo = perda); ym limita até o fim do mês
  assetStats(state, id, ym) {
    const r = { aportes: 0, resgates: 0, rendimentos: 0 };
    for (const t of state.invTx || []) { if (t.assetId !== id || (ym && t.date.slice(0, 7) > ym)) continue; r[t.kind === 'aporte' ? 'aportes' : t.kind === 'resgate' ? 'resgates' : 'rendimentos'] += t.amount; }
    r.value = r.aportes - r.resgates + r.rendimentos; r.pct = r.aportes > 0 ? r.rendimentos / r.aportes * 100 : 0; return r;
  },
  investTotal: (state, ym) => (state.investments || []).reduce((s, a) => s + Fin.assetStats(state, a.id, ym).value, 0),
  // Patrimônio líquido = contas + investimentos − dívida de cartão (parcelas ainda não pagas)
  netWorth: state => Fin.totalBalance(state) + Fin.investTotal(state) - state.cards.reduce((s, c) => s + Fin.cardUsed(state, c.id), 0),
  goalSaved: g => (g.deposits || []).reduce((s, d) => s + d.amount, 0),

  /* ---- Etapa 5: projeção de fluxo de caixa ---- */
  variableExpense: (state, ym) => state.transactions.filter(t => t.type === 'expense' && !t.fixedId && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0),
  averages(state, cur) { // média dos 3 meses anteriores ao mês atual
    const ms = [1, 2, 3].map(i => Fin.shiftMonth(cur, -i)), avg = f => Math.round(ms.reduce((s, m) => s + f(m), 0) / 3);
    return { income: avg(m => Fin.monthSummary(state, m).income), variable: avg(m => Fin.variableExpense(state, m)) };
  },
  pastOpenInvoices(state, cur) {
    const keys = new Set(Fin.installments(state).filter(x => x.invoice < cur).map(x => x.cardId + '|' + x.invoice)); let s = 0;
    keys.forEach(k => { const [c, ym] = k.split('|'); s += Fin.invoice(state, c, ym).open; }); return s;
  },
  // Mês atual: só compromissos conhecidos (fixos pendentes + faturas em aberto, inclusive vencidas).
  // Meses futuros: conhecidos + receitas e despesas variáveis estimadas pela média. Compra no cartão sai do caixa ao pagar a fatura.
  projection(state, n = 6) {
    const cur = Fin.currentMonth(), avg = Fin.averages(state, cur); let balance = Fin.totalBalance(state); const rows = [];
    for (let i = 0; i < n; i++) {
      const ym = Fin.shiftMonth(cur, i);
      const fixed = state.fixed.filter(f => f.start <= ym && (!f.end || f.end >= ym) && !Fin.fixedPaid(state, f, ym)).reduce((s, f) => s + f.amount, 0);
      const invoices = Fin.openInvoices(state, ym) + (i === 0 ? Fin.pastOpenInvoices(state, cur) : 0);
      const income = i === 0 ? 0 : avg.income, variable = i === 0 ? 0 : avg.variable, result = income - fixed - invoices - variable;
      balance += result; rows.push({ ym, income, fixed, invoices, variable, result, balance });
    }
    return rows;
  }
};
