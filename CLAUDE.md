# Jira Project Tracker — Web App

## Cilj projekta

Web aplikacija za praćenje Jira projekata (Epic-based) sa višekorisničkom podrškom.
Svaki korisnik ima nalog, lično podešava svoje Jira kredencijale i prati svoje projekte.
App se hostuje na serveru, dostupna preko browsera.

---

## Tech Stack

- **Frontend**: React + Vite (single-page app)
- **Backend**: Node.js + Express
- **Baza**: SQLite (via `better-sqlite3`) — jednostavno, bez eksternih servisa
- **Auth**: JWT (JSON Web Tokens) + bcrypt za lozinke
- **Charts**: Pure SVG (bez Recharts, bez chart biblioteka)
- **Stilovi**: Inline JS objekti (bez CSS fajlova, bez Tailwind, bez UI biblioteka)
- **Fontovi**: Google Fonts CDN — Syne + DM Mono + DM Sans
- **Jira API**: Svi pozivi idu kroz backend (ne direktno sa frontenda)

---

## Struktura projekta

```
jira-tracker-web/
├── server/
│   ├── index.js              # Express entry point
│   ├── db.js                 # SQLite setup i migracije
│   ├── auth.js               # JWT middleware
│   ├── routes/
│   │   ├── auth.js           # POST /api/auth/register, /api/auth/login
│   │   ├── jira.js           # GET /api/jira/epic/:key, /api/jira/tasks/:key
│   │   └── projects.js       # CRUD za korisnikove projekte
│   └── jiraClient.js         # Jira API helper funkcije
├── client/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── theme.js          # CSS varijable i theme definicije
│   │   ├── api.js            # Fetch wrapper za backend
│   │   ├── utils.js          # processEpicData logika
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   └── DashboardPage.jsx
│   │   └── components/
│   │       ├── Topbar.jsx
│   │       ├── ProjectTabs.jsx
│   │       ├── ProjectCard.jsx
│   │       ├── MetricCards.jsx
│   │       ├── DonutChart.jsx
│   │       ├── BarChart.jsx
│   │       ├── OverrunBanner.jsx
│   │       ├── TaskTable.jsx
│   │       ├── SettingsModal.jsx
│   │       └── ui/
│   │           ├── Badge.jsx
│   │           └── ProgressBar.jsx
│   └── index.html
├── package.json
└── .env.example
```

---

## Dizajn sistem

### Teme (dark/light toggle)

```js
// theme.js — CSS varijable za oba moda
const themes = {
  dark: {
    '--bg':          '#0A0C10',
    '--surface':     '#111318',
    '--surfaceAlt':  '#15181F',
    '--border':      '#1E2433',
    '--borderHover': '#2D3550',
    '--text':        '#E8EBF2',
    '--textMuted':   '#6B7A99',
    '--textSubtle':  '#3D4A66',
    '--accent':      '#4F8EF7',
    '--accentHover': '#6B9FFF',
    '--green':       '#22C55E',
    '--amber':       '#F59E0B',
    '--red':         '#EF4444',
    '--greenTint':   '#0F2A1A',
    '--amberTint':   '#2A1F0A',
    '--redTint':     '#2A0F0F',
  },
  light: {
    '--bg':          '#F0F2F8',
    '--surface':     '#FFFFFF',
    '--surfaceAlt':  '#F8F9FC',
    '--border':      '#E2E6F0',
    '--borderHover': '#C8CFDF',
    '--text':        '#0F1523',
    '--textMuted':   '#5A6480',
    '--textSubtle':  '#A0AABF',
    '--accent':      '#2563EB',
    '--accentHover': '#1D4ED8',
    '--green':       '#16A34A',
    '--amber':       '#D97706',
    '--red':         '#DC2626',
    '--greenTint':   '#F0FDF4',
    '--amberTint':   '#FFFBEB',
    '--redTint':     '#FEF2F2',
  }
}
// Primenjuje se na document.documentElement style, smooth tranzicija 0.3s na svim elementima
```

### Fontovi (Google Fonts CDN u index.html)
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

- **Syne 700–800**: naslovi, KPI vrednosti, project name
- **DM Mono 400–500**: task ID-ovi, key badge-ovi, metrički labeli, numerički podaci
- **DM Sans 400–600**: sav ostali tekst, dugmad, labeli

### Zajednički stilovi komponenti

```js
// Tranzicija na svim interaktivnim elementima
transition: 'all 0.2s ease'

// Card/panel
background: 'var(--surface)',
border: '1px solid var(--border)',
borderRadius: 12,
padding: '20px 24px',

// Hover lift na kartice
':hover': { transform: 'translateY(-1px)', borderColor: 'var(--borderHover)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }
```

---

## UI Layout i komponente

### 1. Topbar (sticky, `position: sticky, top: 0, zIndex: 100`)

```
[ 📊 Jira Tracker ]   [ intelisale.atlassian.net badge ]   ···   [ ☀️/🌙 ]  [ FM avatar ]
```

- **Logo**: emoji + "Jira Tracker" u Syne 700
- **Workspace badge**: Jira URL u DM Mono, muted boja, border, borderRadius 20
- **Theme toggle**: ikonica sunca/meseca, klik menja temu, smooth tranzicija
- **Avatar**: inicijali korisnika u kružiću, accent boja, klik otvara dropdown (Settings, Logout)
- Visina: 56px, `background: var(--surface)`, `borderBottom: 1px solid var(--border)`

### 2. Project Tab bar (ispod topbara, sticky)

```
[ 🟢 Knjaz Miloš B2B  PROJECT-184 ]  [ 🟡 IntelliSale CRM  PROJECT-169 ]  ···  [ + Dodaj projekat ]
```

- Svaki tab: status dot (boja po kategoriji) + project name (DM Sans 500) + ID badge (DM Mono, muted)
- Aktivan tab: `borderBottom: 2px solid var(--accent)`, `color: var(--accent)`
- Hover: blago svetliji background
- **"+ Dodaj projekat"** dugme desno: accent boja, klik otvara modal za unos Epic key-a
- Visina: 48px, `background: var(--surface)`, `borderBottom: 1px solid var(--border)`

### 3. Main content area

`maxWidth: 1400, margin: '0 auto', padding: '28px 28px'`

#### A) Project header

```
[ Project name (Syne 800, 24px) ]                    [ Progress bar ══════════░░░░░░  68% ]
[ 🟢 active   PROJECT-184 · 48 taskova ]             [ ● Završeno  ● In Progress ]
```

- Levo: naziv projekta, status pill (green="active"/amber="paused"), subtitle sa ID + task count
- Desno: dual-color progress bar (zelena=done, žuta=in-progress, siva=todo), visina 10px, borderRadius 5
- Ispod progress bara: legend dots sa labelima i brojevima

#### B) Metric cards grid

`display: grid, gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12`

8 kartica:

| Label (DM Mono, uppercase) | Vrednost (Syne 700, 28px) | Subtitle | Ikonica | Boja vrednosti |
|---|---|---|---|---|
| UKUPNO TASKOVA | 48 | projekti i subtask | 📋 | var(--text) |
| ZAVRŠENO | 20 (42%) | od 48 ukupno | ✅ | var(--green) |
| IN PROGRESS | 4 | aktivno u radu | 🔄 | var(--accent) |
| FOR GROOMING | 24 | čeka planiranje | ⏳ | var(--textMuted) |
| ESTIMACIJA | 221.0h | originalna procena | 📐 | var(--accent) |
| UTROŠENO | 189.6h | logovano vreme | ⏱️ | var(--accent) |
| RAZLIKA | -31.4h | -14% ispod est. | 📉 | var(--green) ako neg, var(--red) ako poz |
| PREKORAČENJA | 3 | taskova >15% over | ⚠️ | var(--red) ako >0, var(--green) ako 0 |

Svaka kartica: `background: var(--surface)`, border, borderRadius 12, padding 16, hover lift.

#### C) Dva-kolonski red (charts)

`display: grid, gridTemplateColumns: '340px 1fr', gap: 16`

**Levo — Donut chart (SVG, pure)**:
- SVG 200x200, `cx=100, cy=100, r=70`
- 3 segmenta: zelena=done, žuta=in-progress, siva=grooming
- Gap između segmenata (stroke-dasharray sa ofsetom)
- CSS animacija `stroke-dasharray` pri učitavanju (0 → finalna vrednost, 0.6s ease)
- Centralni tekst: `{donePct}%` (Syne 800, 22px) + "završeno" (DM Sans, muted)
- Ispod SVG-a: 3 labeled progress bars sa brojevima (Done X/Y, In Progress X/Y, Grooming X/Y)

**Desno — Bar chart (SVG, pure)**:
- Grouped bars: plava = estimacija, zelena/crvena = utrošeno (crvena ako prekoračenje)
- Prikazuje top 12 taskova koji imaju estimaciju
- X-osa: task ID-ovi (DM Mono, 10px, rotiran 45°)
- Y-osa: sati, gridlines (1px, muted boja)
- Legend top-right: ● Estimacija ● Utrošeno ● Prekoračenje
- Tooltip na hover (pure JS, ne biblioteka): prikazuje task key, est, spent, diff

#### D) Overrun alert banner

Prikazuje se **samo** ako ima prekoračenja (overTasks.length > 0).

```
⚠️  3 taska prekoračuju estimaciju za više od 15%
[ ECOM-1774 +105% ]  [ ECOM-1795 +98% ]  [ ECOM-2073 +75% ]
```

- Background: `#EF444408`, border: `1px solid #EF444430`
- Chips: DM Mono, `background: var(--redTint)`, `color: var(--red)`, borderRadius 6

#### E) Tasks table panel

Full-width kartica.

**Header**:
```
Taskovi  (48)      [ 🔍 Pretraži taskove... ]    [Svi 48] [✅ Završeni 20] [🔄 In Progress 4] [⏳ Grooming 24] [⚠️ Prekoračenje 3]
```

- Filter pills sa count badge-ovima, aktivan pill ima accent border
- Search input: DM Sans, `background: var(--bg)`, border

**Column headers** (`background: var(--surfaceAlt)`):
```
ID          Naziv          Status          Napredak          Est.          Utrošeno
130px       1fr            130px           160px             80px          100px
```

**Task rows** (`display: grid, gridTemplateColumns: '130px 1fr 130px 160px 80px 100px'`):

- **ID**: DM Mono, accent boja; ako prekoračenje → red boja + "+X% prekoračenje" subtext ispod
- **Naziv**: DM Sans, truncated; klik expands subtasks (toggle)
- **Status badge** (Badge komponenta):
  - Resolved/Done/Closed → green background tint + green text
  - For Testing/TESTING STARTED/In Progress → blue tint
  - On Hold → amber tint
  - For Grooming/ToDo → gray tint
- **Napredak**: thin progress bar (6px) + percentage text; crvena bar ako prekoračenje
- **Est.**: DM Mono, muted, "–" ako 0
- **Utrošeno**: DM Mono, crvena ako prekoračenje, zelena ako ispod est.

**Subtask expand** (klik na red):
- Subtask redovi su indent-ovani (paddingLeft: 32)
- Manja visina, muted boja
- Prikazuju: key | component badge | summary | status | spent

**Row hover**: blago tamnija pozadina
**Overrun rows**: `background: var(--redTint)`

---

## Reusable UI komponente

### `Badge` (`components/ui/Badge.jsx`)
```jsx
// Props: color ('green'|'blue'|'amber'|'red'|'gray'), children
// Renderuje pill sa: background tint, tekst boja, border, borderRadius 20, DM Sans 500, fontSize 11
```

### `ProgressBar` (`components/ui/ProgressBar.jsx`)
```jsx
// Props: value (0-1), color, height (default 6), showLabel, secondary (za dual-color)
// Rounded, smooth tranzicija na value promenu
```

### `DonutChart` (`components/DonutChart.jsx`)
```jsx
// Props: segments [{value, color, label}], size (default 200), innerRadius (default 70)
// Pure SVG, CSS keyframe animacija na mount
// centerText prop za tekst u centru
```

### `BarChart` (`components/BarChart.jsx`)
```jsx
// Props: data [{label, est, spent}], width, height
// Pure SVG, grupovane bars, tooltip state (useState za hover)
// Automatski skalira Y-osu na max vrednost
```

### `MetricCard` (`components/MetricCards.jsx`)
```jsx
// Props: label, value, subtitle, icon, valueColor
// Hover lift animacija
```

---

## Auth & Korisnički sistem

### Login/Register stranice

Centrirani kartica dizajn (`maxWidth: 420`, margin auto):
- Logo + app naziv na vrhu
- Input polja: `background: var(--bg)`, border, borderRadius 8, focus: accent border
- Primary dugme: `background: var(--accent)`, white tekst, full width
- Link između Login ↔ Register
- Error poruke: red tint banner

### JWT flow
- Token se čuva u `localStorage` kao `jt_token`
- Na svaki API poziv: `Authorization: Bearer {token}` header
- 401 response → redirect na login
- Token expiry: 7 dana

---

## Baza podataka (SQLite)

### Tabela: `users`
```sql
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  jira_url    TEXT,
  jira_email  TEXT,
  jira_token  TEXT,            -- AES-256-CBC encrypted
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabela: `projects`
```sql
CREATE TABLE projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  epic_key     TEXT NOT NULL,
  display_name TEXT,
  position     INTEGER DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, epic_key)
);
```

---

## Backend API Endpoints

### Auth
```
POST /api/auth/register    { email, password, name }              → { token, user }
POST /api/auth/login       { email, password }                    → { token, user }
GET  /api/auth/me          (JWT required)                         → { user }
PUT  /api/auth/jira-config { jiraUrl, jiraEmail, jiraToken }      → { ok }
POST /api/auth/jira-test   { jiraUrl, jiraEmail, jiraToken }      → { ok, displayName }
```

### Projekti
```
GET    /api/projects              → [ { id, epicKey, displayName, position } ]
POST   /api/projects              { epicKey, displayName }        → { project }
DELETE /api/projects/:id          → { ok }
PUT    /api/projects/reorder      { ids: [1,3,2] }                → { ok }
```

### Jira data (proxied)
```
GET /api/jira/epic/:epicKey       → Jira issue fields
GET /api/jira/tasks/:epicKey      → { parents: [], subtasks: [] }
```

---

## Jira API implementacija (backend)

### Kritično: Novi search endpoint
```js
// UVEK koristiti novi endpoint — stari /search je deprecated (410 error)
POST https://{jiraUrl}/rest/api/3/search/jql
Body: { jql: "parent = EPIC-KEY ORDER BY created ASC", fields: [...], maxResults: 100 }

// Auth: Basic base64(email:token)
```

### Paginacija
```js
// Loopovati dok isLast !== true, koristiti nextPageToken iz responsa
do {
  const data = await jiraPost('/search/jql', { jql, fields, maxResults: 100, ...(token ? { nextPageToken: token } : {}) })
  results.push(...data.issues)
  token = data.isLast ? null : data.nextPageToken
} while (token)
```

### Subtask batching
```js
// Fetchovati subtaskove u batchevima od 50
for (let i = 0; i < subKeys.length; i += 50) {
  const batch = subKeys.slice(i, i + 50)
  const data = await jiraPost('/search/jql', { jql: `issuekey in (${batch.join(',')})`, fields })
  subs.push(...data.issues)
}
```

---

## Logika procesiranja Jira podataka (`client/src/utils.js`)

```js
// Status kategorije
const DONE    = new Set(['Resolved', 'Closed', 'Done'])
const IN_PROG = new Set(['In Progress', 'For Testing', 'TESTING STARTED', 'On Hold - Testing', 'Development', 'Review'])
// Sve ostalo → 'todo' (For Grooming, ToDo, itd.)

// Procesiranje podataka
function processEpicData(parents, subtasks) {
  // 1. Izgradi subtask map: key → { components, timespent, timeoriginalestimate, status, summary }
  // 2. Za svaki parent task:
  //    - Proći kroz subtaskove
  //    - Isključiti testing subtaskove sa 0h (TESTING component + timespent === 0)
  //    - calcEst   = parent.timeoriginalestimate + sum(sub.timeoriginalestimate) — bez excluded
  //    - calcSpent = parent.timespent + sum(sub.timespent) — bez excluded
  //    - over flag = calcEst > 0 && calcSpent > calcEst * 1.15
  // 3. Agregirati ukupne statistike
  // 4. Vratiti { tasks, totalEst, totalSpent, done, inprog, todo, total, overTasks, statusCount }
}
```

---

## Sigurnost

- **Lozinke**: bcrypt, cost factor 12
- **Jira token**: AES-256-CBC encrypted u bazi, ključ u `.env` kao `ENCRYPTION_KEY`
- **JWT**: HS256, expiry 7d, payload sadrži samo `{ userId }`
- **CORS**: samo `CLIENT_URL` iz `.env`
- **Rate limiting**: `express-rate-limit` na `/api/auth/*` (max 10/min)
- Jira token se **nikad ne šalje na frontend** — samo `jiraUrl` i `jiraEmail` za prikaz

---

## Settings modal

Dostupan iz avatar dropdown menija, full-screen overlay:

**Sekcije**:
1. **Profil**: prikaz email-a i imena, promena lozinke (stara + nova)
2. **Jira konekcija**: URL + email + token polja, "Test konekcije" dugme sa live feedback-om (✅/❌)
3. **Opasna zona**: Delete nalog (confirm dialog)

---

## Pokretanje

### Development
```bash
npm install          # root install
npm run dev          # concurrently: vite (5173) + express (3001)
```

### Production build
```bash
npm run build        # vite builda client/dist
npm start            # express servi API + static iz client/dist, port 3001
```

Express production setup:
```js
app.use(express.static(path.join(__dirname, '../client/dist')))
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')))
```

### `.env.example`
```
PORT=3001
JWT_SECRET=change-this-to-long-random-string
ENCRYPTION_KEY=change-this-to-32-char-hex-string
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

---

## Deployment

- **Preporuka**: Railway, Render, ili bilo koji Linux VPS
- **Requirements**: Node.js 18+, persistent disk za SQLite fajl
- SQLite fajl lokacija: `./data/tracker.db` (kreirati `data/` folder, dodati u `.gitignore` samo fajl, ne folder)
- Production env varijable setovati u hosting platformi
- Start komanda: `npm run build && npm start`

---

## Sample podaci za development/demo

Dok se Jira ne podesi, app treba da ima 3 demo projekta sa mock podacima:

```js
// Koristiti samo kada korisnik nije konfigurisao Jira kredencijale
const DEMO_PROJECTS = [
  {
    epicKey: 'KNJAZ-184',
    name: 'Knjaz Miloš B2B Portal',
    total: 48, done: 20, inprog: 4, todo: 24,
    totalEst: 221, totalSpent: 189.6,
    // ... tasks array
  },
  {
    epicKey: 'CRM-169',
    name: 'IntelliSale CRM',
    total: 35, done: 28, inprog: 5, todo: 2,
    totalEst: 180, totalSpent: 195,
    // ... tasks array
  },
  {
    epicKey: 'MOB-200',
    name: 'Mobile App 2.0',
    total: 22, done: 8, inprog: 7, todo: 7,
    totalEst: 140, totalSpent: 88,
    // ... tasks array
  }
]
```
