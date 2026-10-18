/* Inicialização: sem Firebase configurado, abre o app em modo local; com Firebase, exige login/cadastro antes. */
(async () => {
  const $ = s => document.querySelector(s), cfg = window.FINANSMART_FIREBASE;
  const configured = !!(cfg && cfg.apiKey && !/^COLE/.test(cfg.apiKey));
  const startApp = () => new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'script.js'; s.onload = res; s.onerror = () => { (window.__missing = window.__missing || []).push('script.js'); rej(new Error('Falha ao carregar script.js')); }; document.body.append(s); });
  if (!configured) return startApp();

  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.body.classList.add('locked'); $('#gate').hidden = false;
  const err = $('#gerr'), submit = $('#gsubmit'), say = m => { err.textContent = m || ''; };
  const MSG = { 'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.', 'auth/email-already-in-use': 'Este e-mail já tem cadastro. Use "Entrar".', 'auth/weak-password': 'Senha fraca. Use pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.', 'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/operation-not-allowed': 'O login por e-mail/senha não está ativado no Firebase.', 'auth/invalid-api-key': 'Configuração do Firebase inválida.' };
  const fail = e => say(MSG[e.code] || 'Não foi possível concluir. Tente novamente.');
  let mode = 'login', started = false, adapter;
  const setMode = m => {
    mode = m; document.querySelectorAll('.gtabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('#gconf').hidden = m !== 'signup'; submit.textContent = m === 'signup' ? 'Criar conta' : 'Entrar'; $('#gpass').autocomplete = m === 'signup' ? 'new-password' : 'current-password'; say();
  };
  document.querySelector('.gtabs').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); };

  try { adapter = await createFirebaseAdapter(cfg); } catch (e) { console.error(e); return say('Não foi possível carregar o Firebase. Verifique a conexão e a configuração.'); }
  $('#gform').onsubmit = async e => {
    e.preventDefault(); const email = $('#gemail').value.trim(), pass = $('#gpass').value;
    if (!email || !pass) return say('Informe e-mail e senha.');
    if (mode === 'signup') { if (pass.length < 6) return say('A senha deve ter pelo menos 6 caracteres.'); if (pass !== $('#gpass2').value) return say('As senhas não conferem.'); }
    say(); submit.disabled = true;
    try { await (mode === 'signup' ? adapter.signUp(email, pass) : adapter.signIn(email, pass)); } catch (x) { fail(x); } finally { submit.disabled = false; }
  };
  $('#greset').onclick = async () => {
    const email = $('#gemail').value.trim(); if (!email) return say('Digite seu e-mail acima para receber o link.');
    try { await adapter.resetPassword(email); say('Se este e-mail tiver conta, enviamos um link para redefinir a senha.'); } catch (x) { fail(x); }
  };
  adapter.onUser(async user => {
    if (!user || started) return; started = true;
    try {
      let initial = await adapter.load();
      if (!initial) { // conta nova: oferece levar os dados que já existiam neste navegador (modo local)
        try { const l = JSON.parse(localStorage.getItem('finansmart:v1')); if (l && confirm('Encontramos dados salvos neste navegador. Enviar para a sua conta?')) initial = l; } catch {}
      }
      Store.use({ load: async () => initial, save: s => adapter.save(s) });
      $('#logout').hidden = false; $('#logout').title = user.email;
      $('#gate').hidden = true; document.body.classList.remove('locked'); say();
      await startApp();
    } catch (x) { console.error(x); started = false; say('Não foi possível carregar seus dados. Recarregue a página e verifique as regras do Firestore.'); }
  });
  $('#logout').onclick = async () => { await adapter.signOut(); location.reload(); };
})();
