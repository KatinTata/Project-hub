# Project Insight Hub (Jira Project Tracker)

Web aplikacija za praćenje Jira projekata sa višekorisničkom podrškom, release notes editorom, dokumentima, porukama, fazama/prognozom i AI Usage modulom.
Produkcija: https://project-hub.intelisale.com (Railway, Nixpacks, start: `node server/index.js`, persistent disk za SQLite).

> Ovaj fajl je prepisan 2026-08-12 prema STVARNOM kodu (P1-16). Izvor istine je uvek kod: `server/routes/*.js` i `server/db.js`.

---

## Tech stack

- **Frontend**: React 18 + Vite (`client/`), custom router preko `history.pushState` (bez react-router-a)
- **Backend**: Node 22 + Express 4 (`server/`)
- **Baza**: SQLite (`better-sqlite3`, WAL), fajl `data/tracker.db` (ili `DATA_DIR`)
- **Auth**: JWT HS256 (7d) + bcrypt (cost 12); rola u bazi: `super_admin` | `admin` | `user` (klijent)
- **Stilovi**: inline JS objekti + CSS varijable teme u `client/src/theme.js`; BEZ CSS fajlova i UI biblioteka
- **Grafikoni**: ručno pisan SVG (bez chart biblioteka)
- **Font**: Hanken Grotesk (Google Fonts CDN; TTF kopije u `server/excel/fonts` za resvg)
- **i18n**: `client/src/lang.jsx` + `client/src/translations.js` (sr + en) — svaki korisnički string ide tamo, nikad hardkodovan
- **Ključne zavisnosti**: TipTap (rich editor), pdfjs-dist, @dnd-kit, ExcelJS, docx, @resvg/resvg-js, @anthropic-ai/sdk, sanitize-html, pino, axios, multer, nodemailer

## Pokretanje

```bash
npm run dev        # Express :3001 + Vite :5173
npm run build      # vite build → client/dist
npm start          # production (Express servira API + client/dist)
npm test           # vitest (tests/)
npm run lint       # eslint (0 errors obavezno; warnings dozvoljeni)
```

`.env`: `PORT`, `JWT_SECRET`, `ENCRYPTION_KEY` (64 hex), `CLIENT_URL`, `NODE_ENV`, opciono `DATA_DIR`, `LOG_LEVEL`.

## Struktura

```
server/
  index.js            # Express entry: helmet, CORS, rate limiti, /health, /rn/:token, global error handler
  db.js               # SQLite setup, CREATE TABLE + aditivne migracije + indeksi (36 tabela)
  auth.js             # authMiddleware: JWT verify (HS256) + postojanje korisnika + token_version + req.userRole
  rbac.js             # getRole, roleFrom, isAdminRole, isSuperAdmin, requireAdmin, requireSuperAdmin
  logger.js           # pino + pino-http (request ID, JSON logovi)
  sanitize.js         # sanitizePublishedHtml — serverska sanitizacija publish HTML-a
  publishedHtml.js    # priprema javne /rn strane: bootstrap skript (CSP hash), retrofit dugmadi
  secretsMigration.js # lazy migracija tajni CBC → GCM na startu
  dates.js            # dayInBelgrade, startOfDayBelgrade, endOfDayBelgrade
  jiraClient.js       # Jira REST transport (timeout/retry/limit), enkripcija tajni (GCM), worklogovi, custom polja
  audit.js            # logAudit helper
  routes/             # auth, projects, jira, users, messages, releaseNotes, documents,
                      # phases, organizations, reports, settings, aiUsage, audit
  aiUsage/            # adminApi (Agentic Admin API proxy), pricing, fx (NBS kursevi),
                      # report (PDF/Excel), budgets, mailer, scheduler
  excel/              # buildReport (ExcelJS + resvg grafikoni)
  scripts/            # sanitizeExistingNotes.js (jednokratna migracija)
client/src/
  main.jsx, App.jsx, theme.js, api.js (fetch wrapper), lang.jsx, translations.js
  utils.js            # processEpicData, buildAssigneeData/ComponentData/ModuleData, billableSecondsOf
  utils/              # stacks.js (STACKS, remainingOf, buildStackMatrix/Teams, buildRoster),
                      # forecast.js, capacity.js, dates.js, roles.js (isClientRole/isInternalRole)
  pages/              # LoginPage, DashboardPage, AddProjectPage, MessagesPage, DocumentsPage,
                      # ReleaseNotesPage, ReleaseNotesEditorPage, QAPage, AiUsagePage
  components/         # 28 komponenti (ProjectCard, TaskTable, PhaseForecast, Topbar, ...)
tests/                # vitest: utils, stacks, forecast, capacity, pricing, fx, dates, crypto
```

## Bezbednosne konvencije (OBAVEZNO za sve nove rute)

1. **RBAC**: role provere idu kroz `server/rbac.js` — nikad lokalne kopije. `authMiddleware` postavlja `req.userId` i `req.userRole`; fail-closed default je `'user'`.
2. **Klijent (rola `user`) nikad ne bira JQL/kredencijale**: filteri se čitaju iz baze za dodeljene projekte (`project_clients`), Jira kredencijali se nasleđuju od vlasnika projekta. Jira ključevi se validiraju regexom `^[A-Z][A-Z0-9_]*-\d+$` i `encodeURIComponent` pri ugradnji u URL.
3. **SQL uvek parametrizovan** (`?` placeholderi) — nula string interpolacija vrednosti.
4. **Sanitizacija**: HTML koji se čuva i javno servira ide kroz `sanitizePublishedHtml` na upisu; javne `/rn` strane imaju strogi CSP (script-src = SHA-256 hash bootstrap skripta iz `publishedHtml.js`).
5. **Tajne**: AES-256-GCM (`v2:iv:tag:ct`), `encryptToken`/`decryptToken` iz `jiraClient.js`; stari CBC format se čita, novi upisi su uvek GCM.
6. **Sesije**: `users.token_version` — promena lozinke/role inkrementira verziju i poništava stare tokene.
7. **Greške**: klijent dobija generičku poruku + `requestId`; detalji samo u pino log (`req.log.error`). Izuzetak: 4xx sa namernom porukom (npr. 422 jiraError).
8. **Rate limiti** (`index.js`): `/api` 1000/15min; `/api/auth/login` 15/15min (samo neuspešni); `/api/release-notes/ai-enhance` 60/15min.

## API rute (po fajlu; rola: SA=super_admin, A=admin+SA, U=svi ulogovani, U*=klijent sa ograničenjem, PUB=javno)

**Van /api**: `GET /health` PUB (status+dbOk) · `GET /rn/:token` PUB (objavljeni release note, CSP)

**auth** (`/api/auth`): POST `/setup` PUB (samo prazna baza) · POST `/login` PUB · GET `/me` U · PUT `/jira-config` SA · POST `/jira-test` SA · PUT `/ai-config` SA · PUT `/password` U (vraća nov token) · DELETE `/account` U

**projects** (`/api/projects`, U ali admin vidi samo SVOJE projekte, klijent samo dodeljene): GET `/` · POST `/` A · DELETE `/:id` (arhiviranje) · GET `/archived` · PUT `/:id/restore` · DELETE `/:id/permanent` · GET+PUT `/:id/billable` · GET+PUT `/:id/stack-people` · GET+POST `/:id/team`, DELETE `/:id/team/:memberId` · POST `/:id/snapshot`, GET `/:id/snapshots` · PUT `/reorder` · PUT `/:id`

**jira** (`/api/jira`): GET `/epic/:epicKey` U* · POST `/tasks` U* (klijent: filter isključivo iz baze) · POST `/test-jql` A · GET `/jql-fields` A · GET `/jql-suggestions` A · GET `/task-info/:key` U* (klijent: samo ključevi iz poruka svojih projekata) · GET `/changelog/:key` A

**users** (`/api/users`, sve A; super_admin nalog sme da menja samo SA): GET `/` · POST `/` · PUT `/:id` · DELETE `/:id` · GET+POST `/:id/projects`, DELETE `/:id/projects/:projectId` · POST `/import` (bulk)

**messages** (`/api/messages`, U — klijent vidi javne + svoje): GET `/unread-count` · GET `/recent-unread` · PUT `/read-all` · GET `/:projectId/clients` A · GET `/:projectId/export` A (CSV) · GET `/:projectId` · POST `/:projectId`

**release-notes** (`/api/release-notes`; router-level gate: sve A osim client-open ruta): POST `/task-detail`, `/tasks`, `/field-suggestions`, `/export/xlsx`, `/export/docx`, `/ai-enhance` · GET+POST `/sections`, DELETE `/sections/:id` · POST `/publish` (sanitizacija!) · GET `/public/:token` PUB · GET `/list` · GET `/client-list` U · GET `/:id/detail` U* · GET+PUT `/:id/clients` · PUT `/:id/release` · DELETE `/:id`

**documents** (`/api/documents`, U — klijent vidi po `visible_to`): GET+POST `/sections`, PUT+DELETE `/sections/:id` A · GET `/` · POST `/` A (multer PDF, max 50MB) · GET `/:id/download` · DELETE `/:id` A

**phases** (`/api/phases`, pristup po projektu): GET `/:projectId` · POST `/:projectId` (vlasnik) · PUT `/:phaseId` · DELETE `/:phaseId` · POST `/:projectId/assign` · POST `/:projectId/reorder`

**organizations** (`/api/organizations`): GET `/` U · POST+PUT+DELETE SA

**reports** (`/api/reports`): POST `/:projectId/excel` U (klijent dobija klijentsku verziju)

**settings** (`/api/settings`): GET `/` U · PUT `/` SA (workdayHours, workdaysPerWeek)

**audit** (`/api/audit`): GET `/` SA

**faq** (`/api/faq`): GET `/` U (po `?lang=`) · POST/PUT/DELETE A (sanitize-html na odgovoru)

**alerts** (`/api/alerts`, P3-3): GET `/my` U (in-app upozorenja kroz alert_deliveries) · PUT `/my/read-all` U · GET+PUT `/:projectId/rules` A (vlasnik; efektivna pravila projekat>global>default) · GET `/:projectId/history` A · POST `/:id/ack` A

**reports — automatski (P3-2, u `/api/reports`)**: GET+POST `/:projectId/schedules`, PUT+DELETE `/schedules/:id`, POST `/schedules/:id/run-now`, GET `/:projectId/runs` A (vlasnik) · GET `/my/runs` + GET `/runs/:id/download` U (klijent: samo audience=clients na dodeljenim projektima)

**ai-usage** (`/api/ai-usage`; pregled A, upravljanje SA, `/my*` za klijente):
GET `/dashboard`, `/trends`, `/by-client`, `/by-source`, `/by-app`, `/by-model`, `/tenants`, `/tenant-report`, `/filter-options` A ·
GET+PUT `/admin/config`, POST `/admin/test`, PUT `/admin/pricing-config`, GET `/admin/models`, PUT `/admin/models/:modelName`, GET `/admin/history`, POST `/admin/sync` (Azure cene), POST `/admin/fx-fetch` (NBS kursevi), GET `/admin/mappings`, POST `/admin/mappings/discover`, PUT `/admin/mappings/:tenantId` SA ·
GET `/alerts`, POST `/alerts/:id/ack` A · GET `/budgets` A, PUT `/budgets/:tenantId` SA, POST `/budgets/check` SA · GET `/packages` A, POST+PUT+DELETE `/admin/packages*` SA ·
GET `/my`, `/my-budget` U (klijent preko `client_tenant_users`) · GET `/export/xlsx`, `/export/html` A

## Baza (36 tabela u server/db.js — aditivne migracije, NIKAD destruktivne)

| Tabela | Svrha / ključne kolone |
|---|---|
| `users` | nalozi: email, password (bcrypt), name, role, jira_url/email/token (GCM), anthropic_key (GCM), organization_id, token_version |
| `projects` | user_id (vlasnik), epic_key, display_name, position, archived, filter_type ('epic'/'jql'/'combined'), filter_jql, filter_meta |
| `project_clients` | dodela klijenata projektu: project_id, client_user_id (UNIQUE par) |
| `messages` | poruke po projektu: project_id, sender_id, recipient_user_id (NULL=svi), text, task_key, task_summary, subject |
| `message_reads` | PK (message_id, user_id) |
| `organizations` | name (klijentske firme) |
| `audit_log` | user_id, action, detail, ip, created_at |
| `phases` | project_id, name, position, start_date, due_date |
| `phase_tasks` | project_id, phase_id, task_key (UNIQUE project+key) |
| `published_notes` | token (javni link), project_id, user_id, title, version, status, html (sanitizovan), section_id, released_at |
| `release_note_sections` | user_id, name, position |
| `release_note_clients` | note_id, client_user_id |
| `document_sections` | name, position |
| `documents` | section_id, title, file_path i/ili file BLOB, visible_to ('all' ili JSON lista id-jeva), uploaded_by |
| `task_billable` | ručni billable override po (project_id, task_key) |
| `app_settings` | k/v: workdayHours (6.5), workdaysPerWeek (5)... |
| `project_stack_people` | project_id, stack, people (broj ljudi po steku) |
| `project_team` | project_id, name, stack — roster za forecast/capacity |
| `project_snapshots` | project_id, day, payload JSON (UNIQUE project+day) — trend |
| `integration_api_configs` | Agentic Admin API: service_key, base_url, service_password_enc (GCM), is_active |
| `ai_pricing_config` | id=1: global_markup_pct, pricing_source_url, last_synced_at/ok/message |
| `ai_model_pricing` | model_name UNIQUE, input/output_price_per_1m, model_markup_pct, source ('azure'/'manual'), is_active |
| `ai_model_pricing_history` | audit promena cena |
| `ap_exchange_rates` | currency_from→RSD, rate, rate_date (NBS preko kurs.resenje.org) |
| `client_tenant_mappings` | tenant_id, tenant_name, sl/eproc GUID-ovi, is_active, is_tracked |
| `client_tenant_users` | tenant_id ↔ user_id (many-to-many) |
| `tenant_budgets` | tenant_id PK, monthly_limit_eur, warning_pct, package_id, sent_* mesečni markeri |
| `ai_packages` | paketi: monthly_fee_eur, included_eur |
| `ai_usage_alerts` | budžet alarmi: tenant, level, month (UNIQUE trojka), acked_at |
| `faq` | FAQ iz baze (P2-E1): category, lang, question, answer (sanitizovan HTML), keywords, position |
| `report_schedules` | automatski izveštaji (P3-2): project_id, cadence, day/hour, recipients_mode |
| `report_recipients` | custom email primaoci po rasporedu |
| `report_runs` | istorija slanja; UNIQUE(schedule_id, period) = dedup; period NULL za ručno |
| `alert_rules` | pravila upozorenja (P3-3): scope project/global, type, threshold, channel, audience; UNIQUE(scope, project_id, type) |
| `alerts` | nastali alarmi; dedup_key UNIQUE sprečava ponavljanje; ack polja |
| `alert_deliveries` | in-app isporuke po korisniku (read_at) |

## Politike klijentskog portala (P3 odluke)

- **Klijent NE vidi utrošene/naplative sate** — server strip u `jira.js` (client-safe DTO za rolu `user`: bez worklogova, imena, estimacija, sirovih custom polja). Izuzetak: `app_settings.clientShowsBillableHours = 'true'` vraća SAMO naplative sate (nikad estimacije/overrun). Default: isključeno.
- **Podrazumevana kadenca izveštaja**: nedeljno, ponedeljak 08:00 (Beograd) — default vrednosti forme.
- **Upozorenja klijentu**: samo `new_release` (default publika client); `overrun`/`phase_delay`/`no_activity` idu internom timu. AI budžeti ostaju u `ai_usage_alerts` (ne dupliraju se).
- **Mejl po alarmu je trenutan uz dedup** (bez dnevnog digest-a za sada) — kanal po pravilu (in_app/email/both).

## Obračunska logika (testirana — tests/, 180+ testova)

- `processEpicData` (utils.js): kategorije done/testing/inprog/todo/**unknown** (nepoznat status NE pada u inprog), prag prekoračenja 15%, orphan subtaskovi, epicSelf red, hoursToBill sati→sekunde
- `stacks.js`: STACKS = Backend/Frontend/Mobile/Database/Testing/Ostalo; `remainingOf` — otvoren task preko plana zadržava rep 10% estimacije (OVERRUN_TAIL_PCT); `buildRoster` — jedini izvor broja ljudi po steku
- `forecast.js`: man-days = remaining / workdayHours; faze se lančaju; stekovi u fazi paralelno
- `capacity.js`: load po prozoru faze; statusi ok/tight/over/nostaff/nowindow/**nocapacity**; preklapanja se sabiraju preko SVIH aktivnih faza (sweep)
- `pricing.js`: cena = Azure base × (1 + markup); poklapanje modela po celim segmentima imena (bez tihe zamene gpt-4o→gpt-4); nepoklopljen model = necenovan, nikad 0 tiho
- `fx.js`: USD interno; konverzija na nivou izveštaja; kurs stariji od 7 dana → `rate_stale` + upozorenje
- Datumi: **Europe/Belgrade** konvencija na serveru (`server/dates.js`), lokalna ponoć na klijentu (`client/src/utils/dates.js`)

## Jira API (server/jiraClient.js)

- UVEK `POST /rest/api/3/search/jql` (stari `/search` je mrtav, 410); paginacija preko `nextPageToken` dok `isLast`
- Subtaskovi u batchevima od 50 (`issuekey in (...)`); worklogovi: prvih 20 inline, ostalo kroz `/issue/:key/worklog`
- Transport: timeout 20s, retry 3× (backoff) samo za mrežu/429/5xx, max 8 paralelnih konekcija
- Custom polja se detektuju po imenu i keširaju po instanci: billable, Module(s), "Hours to be billed"
- Kredencijali: korisnikovi ili nasleđeni od super_admina (`sharedJira`)

## Testovi i CI

- `tests/*.test.js` (vitest): obračun (golden-master pristup), pricing/fx sa mock in-memory bazom (`vi.mock('../server/db.js')`), datumi, kripto
- CI (`.github/workflows/ci.yml`): npm ci → lint → test → build na Node 22, na push/PR
- Pre-commit: husky + lint-staged (eslint na staged fajlovima)
- Pravilo: `npm run build` + `npm test` moraju proći pre svakog commita; commit po stavci u stilu `fix(scope): opis`

## Dizajn konvencije

- CSS varijable iz `theme.js` (dark/light), font Hanken Grotesk, borderRadius 8–12, `transition: all 0.2s ease`
- BEZ emojija u UI-ju, BEZ UI biblioteka; SVG grafikoni ručno
- Svaki novi string u `translations.js` (sr + en); ključevi tipa `'pc.tab.stacks'`
- Klijentski prikaz (rola `user`): bez estimacija, internih sati, overrun-a — provere kroz `client/src/utils/roles.js`
