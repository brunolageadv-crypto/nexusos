# NexusOS — Dashboard de Vida Pessoal

Stack: **React 18 + Vite + TypeScript + Tailwind CSS + Firebase + Google Auth**

## Módulos

| Módulo | Descrição |
|--------|-----------|
| 🎬 Media Tracker | Séries, filmes e livros com % de progresso |
| ⏱ Ponto Eletrônico | Registro de horas com saldo e timestamps |
| 💰 Financeiro | Entradas/gastos com categorias, tags e gráficos |
| 📓 Journaling | Diário pessoal com Markdown e streak |

---

## Setup — passo a passo

### 1. Firebase

1. Crie um projeto em https://console.firebase.google.com
2. Ative **Authentication → Provedores → Google**
3. Ative **Firestore Database** (modo produção)
4. Copie as credenciais em **Configurações do Projeto → Seus apps → Web**

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
# Preencha todas as variáveis VITE_FIREBASE_*
```

### 3. Instalar e rodar

```bash
npm install
npm run dev
```

### 4. Deploy Netlify + GitHub Actions

**Netlify:**
1. Conecte o repositório em app.netlify.com
2. Build command: `npm run build`
3. Publish directory: `dist`

**GitHub Secrets** (Settings → Secrets → Actions):
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
NETLIFY_AUTH_TOKEN   ← gere em app.netlify.com/user/applications
NETLIFY_SITE_ID      ← Site settings → General → Site ID
```

Todo push na `main` dispara o deploy automaticamente.

### 5. Regras Firestore

No console Firebase → Firestore → Regras, cole o conteúdo de `firestore.rules`.

---

## Estrutura do projeto

```
nexusos/
├── src/
│   ├── components/
│   │   ├── dashboard/      # Dashboard.tsx — agregador central
│   │   ├── media/          # MediaTracker (próxima fase)
│   │   ├── ponto/          # PontoEletronico (próxima fase)
│   │   ├── finance/        # FinanceControl (próxima fase)
│   │   └── journal/        # Journal (próxima fase)
│   ├── hooks/
│   │   ├── useAuth.tsx     # Contexto de autenticação Google
│   │   └── useFirestore.ts # Hooks de dados em tempo real
│   ├── lib/
│   │   └── firebase.ts     # Inicialização Firebase
│   ├── pages/
│   │   └── LoginPage.tsx   # Tela de login Google
│   ├── types/
│   │   └── index.ts        # Todos os tipos TypeScript
│   ├── utils/
│   │   └── index.ts        # Lógica de negócio (progresso, horas, finanças)
│   ├── App.tsx             # Shell com sidebar e roteamento
│   └── index.css           # Tema dark + variáveis CSS
├── .github/workflows/
│   └── deploy.yml          # CI/CD GitHub Actions → Netlify
├── firestore.rules         # Regras de segurança Firestore
├── .env.example            # Template de variáveis
└── tailwind.config.js      # Tokens do tema NexusOS
```

---

## Modelo de dados (Firestore)

### `users/{uid}`
```typescript
{ uid, displayName, email, photoURL, createdAt, settings }
```

### `media/{id}`
```typescript
{ userId, type, title, status, totalEpisodes?, watchedEpisodes?,
  totalPages?, currentPage?, rating?, notes, createdAt, updatedAt }
```

### `timeEntries/{id}`
```typescript
{ userId, date, clockIn, clockOut?, breakMinutes, expectedHours, notes, createdAt }
```

### `transactions/{id}`
```typescript
{ userId, type, amount, category, tags[], description, date, createdAt }
```

### `journalEntries/{id}`
```typescript
{ userId, date, content, mood?, tags[], createdAt, updatedAt }
```

---

## Próximas fases

- [ ] Páginas completas de cada módulo (CRUD)
- [ ] Editor Markdown para Journal
- [ ] Busca full-text no Journal
- [ ] Gráficos avançados de finanças por categoria
- [ ] Relatório semanal de horas em PDF
- [ ] PWA (installable)
