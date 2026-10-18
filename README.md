# FinanSmart

Gestão financeira pessoal em HTML, CSS e JavaScript puro. Sem Firebase configurado, funciona offline, sem login, com dados no navegador. Com Firebase (veja `FIREBASE.md`), tem login/cadastro e sincronização entre aparelhos.

## Executar localmente
Abra `index.html` (duplo clique) para o modo local. Para testar o login do Firebase use `python3 -m http.server 8000` e acesse http://localhost:8000.

## Publicar no GitHub Pages
**Sem instalar nada:**
1. github.com → **New repository**: nome `finansmart`, **Public**, sem README → Create.
2. Clique em **uploading an existing file**, arraste `index.html`, `style.css`, `script.js`, `README.md`, `FIREBASE.md` e os arquivos `.js` (todos na raiz) → **Commit changes**.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**. Em 1–2 minutos o endereço `https://SEU-USUARIO.github.io/finansmart/` aparece ali.
4. No Firebase, adicione `SEU-USUARIO.github.io` em Authentication → Domínios autorizados.

**Com git:**
```
cd finansmart
git init && git add . && git commit -m "FinanSmart"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/finansmart.git
git push -u origin main
```
Para atualizar depois: `git add . && git commit -m "ajustes" && git push`.

⚠ O repositório é público: **nunca envie arquivos de backup (.json)** com seus dados. O `.gitignore` já ignora `finansmart-backup-*.json` (o upload pelo navegador não usa o `.gitignore`; só não arraste esses arquivos).

## Estrutura
`storage.js` armazenamento · `finance.js` regras · `importer.js` planilhas · `firebase-config.js` configuração · `firebase-adapter.js` Firebase · `boot.js` login e inicialização · `script.js` interface · `style.css` visual.
