# Firebase (projeto novo) — login e sincronização do FinanSmart

Sem Firebase configurado, o app roda em modo local, sem login. Com a configuração colada em `js/firebase-config.js`, aparece a tela de **Entrar / Criar conta** e os dados passam a ser salvos na sua conta (Firestore), por usuário.

## 1. Criar o projeto
1. Em https://console.firebase.google.com clique em **Adicionar projeto** (ex.: `finansmart`). Plano **Spark**, sem cartão. O Google Analytics pode ficar desativado.
2. **Build → Authentication → Começar → E-mail/senha → Ativar**.
3. **Build → Firestore Database → Criar banco de dados**, modo **produção**, região `southamerica-east1` (São Paulo) ou outra próxima.
4. **Configurações do projeto (engrenagem) → Seus apps → `</>` Web**: registre o app (não precisa de Hosting) e copie o objeto `firebaseConfig`.

## 2. Regras de segurança (projeto novo: pode substituir tudo)
**Firestore → Regras**, cole e publique:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
Cada usuário só acessa `users/<seu uid>/...`. Todo o resto fica bloqueado.

## 3. Configurar o app
Abra `js/firebase-config.js` e troque os valores pelos do passo 1.4. A `apiKey` do Firebase Web não é segredo (pode ir para o GitHub); quem protege os dados são as regras acima. Opcional: no Google Cloud Console, restrinja a chave a `https://SEU-USUARIO.github.io/*`.

## 4. Autorizar o domínio
**Authentication → Configurações → Domínios autorizados → Adicionar domínio**: `SEU-USUARIO.github.io`. (`localhost` já vem autorizado.)

## 5. Testar
O login do Firebase **não funciona abrindo o arquivo por duplo clique** (`file://`). Teste de uma destas formas:
- na pasta do projeto, `python3 -m http.server 8000` e abra http://localhost:8000
- ou publique no GitHub Pages (veja o README).

No primeiro login numa conta nova, se houver dados do modo local neste navegador, o app pergunta se quer enviá-los. Os dados ficam em `users/{uid}/...` (um documento por lançamento, conta, cartão etc.).

## Observações
- **Comprovantes** (JPEG/PNG/PDF) continuam no navegador (IndexedDB) e não sincronizam, porque o Cloud Storage for Firebase pode exigir plano pago. Eles viajam pelo backup (💾). Confirme as condições atuais em https://firebase.google.com/pricing.
- Cota gratuita do Firestore: confira na página de preços. O app grava só o que mudou e usa cache offline para reduzir leituras.
- **Esqueci a senha** envia o e-mail de redefinição do Firebase. Para trocar o texto do e-mail: Authentication → Modelos.
- Faça backups (💾) de vez em quando, mesmo com a sincronização.
