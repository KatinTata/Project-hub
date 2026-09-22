# Stanje — Project Insight Hub

_Poslednje ažuriranje: 22.09.2026._

## Gde smo
Aplikacija je na produkciji: **project-hub.intelisale.com** (Railway, Nixpacks,
`node server/index.js`, SQLite na persistent disku). Postoji dnevni backup u 03:00
po Beogradu, lokalno 14 dana, plus šifrovana off-site kopija kad su S3 varijable
podešene — runbook je u `RESTORE.md`.

Osnova radi: praćenje Jira projekata, više korisnika sa rolama
(`super_admin` / `admin` / `user`), release notes editor, dokumenti, poruke,
faze i prognoza, AI Usage modul. 38 tabela, 203 testa (svi prolaze).

## Šta je zadnje rađeno (22.09.2026.)
Sve gore opisano (Faza A, izmene tabele zadataka, podizanje statusa po subtaskovima)
commit-ovano je i push-ovano na `main` (`086292c`) — do tada je stajalo samo lokalno,
pa se na produkciji nije videlo. Railway je odatle deploy-ovao. Pred slanje: 209 testova
prolazi, lint 0 grešaka, build prolazi.

## Šta je rađeno pre toga (21.09.2026.)
Status glavnog zadatka prati subtaskove (samo klijentski prikaz):
- `processEpicData` dobija opciju `rollupSubtaskStatus` (`client/src/utils.js`); kad je
  uključena, status glavnog zadatka se podiže na najdalji status među subtaskovima
  (u radu < na testiranju). Primer: PP-2451 je u „To Do", subtask PP-2589 je „In Progress"
  → klijent vidi „U radu".
- **zatvoren subtask nikad ne zatvara glavni zadatak** — „Završeno" se klijentu prikazuje
  tek kad se zatvori sam glavni zadatak; status se nikad ne spušta
- opcija se uključuje samo za klijenta (`queries.js`, `isClient`); interni tim, snapshot-i
  i Excel izveštaji i dalje vide sirov Jira status
- keš u `localStorage` iz vremena pre ove izmene se klijentu preskače (marker `statusRollup`),
  da ne bi gledao stare statuse do sledećeg osvežavanja
- 6 novih testova (`tests/utils.test.js`), ukupno 209 testova prolazi

Poznato ograničenje: adminov „pregled kao klijent" i dalje prikazuje sirove statuse, jer
koristi interne podatke projekta.

Klijentski pregled projekta (`components/portal/ClientOverview.jsx`):
- **sekcija dokumenata uklonjena** sa stranice projekta (`ProjectDocuments.jsx` obrisan) —
  prikazivala je sva dokumenta deljena sa klijentom, ne dokumenta tog projekta, a
  Dokumenta već imaju svoju stranicu u meniju
- **traka napretka pokazuje sve zadatke po statusu** umesto jedne boje: završeno (zeleno),
  na testiranju (narandžasto), u radu (plavo), predstoji (sivo), sa tačnim brojem i
  procentom po kategoriji ispod trake
- **kolona „Napredak" u tabeli zadataka** klijentu više nije prazna: pošto server roli
  `user` ne šalje sate, prikazuje se putanja statusa u četiri koraka, obojena po fazi
  (predstoji → u radu → na testiranju → završeno)
- **spisak zadataka je otvoren po defaultu** (ranije sklopljen); izbor se i dalje pamti

Tabela zadataka u klijentskom prikazu (`components/TaskTable.jsx`):
- **klijent više ne vidi subtaskove** — subtask redovi se renderuju samo internom timu
  (isto važi i za admina u režimu „pregled kao klijent")
- **klik na red otvara pun opis zadatka** — ispod reda se otvara panel sa punim
  klijentskim naslovom i celim opisom (prelama se u više redova); u samom redu opis
  ostaje skraćen na jednu liniju da tabela ostane pregledna
- zadatak bez pripremljenog klijentskog teksta u panelu dobija poruku
  „Opis za ovaj zadatak još nije pripremljen." umesto praznine
- tri nova stringa u `translations.js` (`table.detail.*`, sr + en)
- lint 0 grešaka, 203 testa prolaze, build prolazi; provereno u browseru
  (klijentski i interni prikaz, dug i kratak opis, zadatak bez opisa)

Napomena: „pun opis" je postojeći AI-generisani klijentski tekst (jedna rečenica iz
`task_client_texts`), sada bez skraćivanja. Duži opis od 2–4 rečenice bi tražio novu
kolonu u bazi i novi AI prolaz — nije rađeno.

## Šta je rađeno pre toga (14.09.2026.)
Obogaćen klijentski pregled projekta (Faza A iz `docs/SPEC-klijentski-portal.md`):
- **vremenska osa faza** (`components/portal/PhaseTimeline.jsx`) — trake od početka do roka,
  marker „danas", stanje faze (završena / kasni / u toku / predstoji); kad faze nemaju
  rokove, ostaju dosadašnje trake napretka
- **tok „Šta je novo"** (`WhatsNew.jsx`) — objave, poruke, izveštaji i upozorenja jednog
  projekta u jednoj hronološkoj listi; zamenio tri pločice koje su pokazivale po jednu stavku
- **tempo rada** (`Velocity.jsx` + `utils/portal.js`) — završene stavke u poslednjih ~30 dana
  i nedeljni prosek iz dnevnih snapshot-a; **bez projektovanog datuma završetka** (odluka 14.09.)
- **dokumenta** na stranici projekta (`ProjectDocuments.jsx`)
- **statusi na klijentskom jeziku** — sirovi Jira statusi („In Review", „Grooming") svode se na
  četiri reči, i u koloni statusa i u filter-čipovima tabele
- ispravka: objava bez `project_id` se više ne prikazuje na svakom projektu klijenta
- 14 novih testova (`tests/portal.test.js`); ukupno 203 testa prolaze, lint 0 grešaka, build prolazi
- provereno u browseru na dev bazi (desktop + telefon), uključujući klijentski nalog

Commit-ovano i push-ovano 22.09.2026. (`086292c`) — na produkciji.

## Šta je rađeno ranije (08.09.2026.)
Nova navigacija po Predlogu A (dizajn: https://claude.ai/code/artifact/9f42b3ad-a90d-4304-aa02-2af2856469b1):
- jedan bočni meni (`client/src/components/shell/`): Projekti / Portal / Administracija,
  korisnik na dnu sa Profil / Jezik / Odjava; na mobilnom fioka sa hamburgerom
- tanko zaglavlje strane: nadnaslov (grupa) + naslov + zvonce
- Podešavanja su stranica `/settings/:section` (profil, jezik, Jira, AI, osvežavanje),
  Korisnici i organizacije su stranica `/users` — modali uklonjeni
- samo svetla tema; izbor teme uklonjen; pozadinska animacija ostaje samo na login/loading ekranu
- Topbar i ProjectTabs obrisani; stranice više ne renderuju sopstveni header
- lokalno: build, lint (0 grešaka) i 189 testova prolaze na Node 20 (Homebrew)

Commit `d17e3e5 feat(shell): unified sidebar navigation, light theme only` je pushovan na `main`
08.09.2026. (rebase preko `e9d4fcb`, AI prevod u RN editoru). Deploy ide automatski kroz Railway.

Ranije (03–04.09.): klijentski portal (jezik/tema po korisniku, klijentski tekstovi
taskova, pregled kao klijent), AI Usage po servisu i cena po zahtevu za MCP alate.

## Nalazi analize 07.09. koji još čekaju
- ~26 hardkodovanih srpskih stringova van `translations.js` (AssigneeWorkload, ProjectTrend, PhaseForecast, ui/collapse)
- server na 69 mesta piše kroz `console.*` umesto pino
- nema testova za HTTP rute / RBAC / klijentski DTO bez sati
- QAPage + qaData (~600 linija) su mrtav kod od 04.09. — odluka: brisati ili vratiti
- `docs/` i `.claude/` nisu u git-u

## Sledeći korak
1. Provera na produkciji sa stvarnim klijentskim nalogom da se status glavnog zadatka
   zaista podiže po subtaskovima (klijentu treba jedno osvežavanje da preskoči stari keš)
2. Faza B iz `docs/SPEC-klijentski-portal.md`: proširiti `TASK_FIELDS` (`updated`,
   `created`, `resolutiondate`, `priority`, `labels`, `fixVersions`, `duedate` — `duedate`
   se povlači ali se ne prikazuje), client-safe istorija promena, izveštaj na zahtev za
   klijenta, higijena (klijentu se i dalje šalju `filterJql`/`filterMeta`)
3. Dva zatečena baga u `ClientNotificationModal.jsx` (nezamenjen `{n}`, dupla strelica)
4. Higijena: stringovi u translations, pino umesto console, odluka o QA kodu
5. Testovi za RBAC i klijentski DTO
6. Release kalendar i dashboard: specifikacija pre koda; sastanak sa Zokom i Novakom

## Otvoreno
Kadenca izveštaja (kod ima default: nedeljno, ponedeljak 08:00), lista primaoca,
valuta u kojoj se prikazuje potrošnja (kod ima default EUR, podržava USD i RSD).

## Lokalno okruženje
Node 22 nije instaliran; radi Node 20 sa `/opt/homebrew/opt/node@20/bin` (nije na PATH-u).
Dev server za pregled: `.claude/launch.json` (konfiguracija `hub-dev`) sa privremenom bazom
u scratch folderu i dev-only tajnama — ne koristi produkcijski `.env`.

---

_Ažurira se na kraju svake sesije. Za tehnički kontekst — stack, rute, shema baze,
bezbednosne konvencije — izvor je `CLAUDE.md` u korenu, koji je pisan iz stvarnog koda._
