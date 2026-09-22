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
Popravke posle provere na produkciji (klijentski nalog):
- **lista zadataka je bila odsečena** (npr. 13 od 22) — virtualizacija tabele
  (`TaskTable.jsx`) je pratila skrol PROZORA, a od nove navigacije se skroluje
  `<main id="app-content">` u AppShell-u; `window.scrollY` je uvek 0, pa se računao samo
  prvi ekran redova. Sada virtualizer prati stvarni skrol element (najbliži skrolujući
  predak; ako ga nema, lista se renderuje cela). Provereno u browseru na privremenoj
  probnoj strani: pre popravke 17 od 22 reda i poslednji zadatak se nikad ne pojavi,
  posle popravke svih 22.
- **klijentu je keš ostajao zamrznut** — `staleTime: Infinity` + keš u localStorage, a
  klijent nema dugme za osvežavanje ni auto-refresh, pa ni F5 nije povlačio nove podatke.
  Sada klijentu keš stari posle 5 minuta (`CLIENT_STALE_MS` u `queries.js`): prikaz je i
  dalje trenutan iz keša, a svež Jira fetch ide u pozadini. Interni tim ostaje na
  ručnom / dnevnom osvežavanju.
- **sekcija „Tempo rada" (delivery pace) uklonjena** iz klijentskog portala, zajedno sa
  `Velocity.jsx`, `computeVelocity` i pripadajućim testovima i stringovima.
- **nove boje statusa**: završeno zeleno, na testiranju plavo, u radu ljubičasto
  (`--purple` u `theme.js`), predstoji sivo. Promenjeno svuda gde se te četiri kategorije
  boje (tabela zadataka, klijentski portal i grafikoni, kartice i traka na projektu,
  raspodela po izvršiocima, status čipovi u RN editoru), da se na istom ekranu ne mešaju
  dve šeme. Provereno u browseru.
- 201 test prolazi (9 velocity testova uklonjeno), lint 0 grešaka, build prolazi.
- **dugme „Osveži" za klijenta** u zaglavlju projekta, sa vremenom poslednjeg
  osvežavanja (`ClientOverview.jsx`, prosleđeno iz `DashboardPage.jsx`) — do sada je
  klijent zavisio isključivo od isteka keša.
- **klijent vidi tačno četiri statusa**: za rad — u radu — na testiranju — završeno.
  Label „Predstoji" / „Upcoming" preimenovan u „Za rad" / „To Do" (zadatak u backlogu
  nije „budući", nego „za rad"), a zadatak sa neprepoznatim Jira statusom (`unknown`)
  se kod klijenta broji u „za rad" umesto da dobije svoj čip sa istim imenom.

Sve gore opisano (Faza A, izmene tabele zadataka, podizanje statusa po subtaskovima)
commit-ovano je i push-ovano na `main` (`086292c`) — do tada je stajalo samo lokalno,
pa se na produkciji nije videlo. Railway je odatle deploy-ovao. Pred slanje: 209 testova
prolazi, lint 0 grešaka, build prolazi.

Adminov „pregled kao klijent" sada pokazuje iste statuse kao klijent (`677a28c`):
- nova funkcija `applyStatusRollup(tasks)` (`client/src/utils.js`) primenjuje isto pravilo
  na već obrađene zadatke — admin povlači sirove (interne) podatke, pa se podizanje radi
  naknadno, samo nad kopijom liste za tabelu (`ProjectCard.jsx`)
- filter-čipovi i brojači iznad tabele se poklapaju sa klijentskim, jer se računaju iz iste liste
- kartice iznad tabele (ukupno završeno / u radu) namerno ostaju interne — pregled je i do
  sada bio samo tabela
- 1 nov test, ukupno 210 prolazi; lint 0 grešaka, build prolazi; nije provereno u browseru
  (traži admin nalog sa stvarnim Jira projektom)

Zatečeno, nije dirano: serverski dnevni snapshot (`server/snapshots.js`) računa statuse BEZ
podizanja po subtaskovima, pa klijent uživo može videti „u radu: 3", dok isti zadaci u
grafikonu napretka kroz vreme tog dana stoje kao „predstoji". Ispravka je jedna linija, ali menja
brojeve u istoriji unapred — čeka odluku.

Provereno usput (odgovor na pitanje, bez izmene koda): lista zadataka klijentu NIJE snimljena
kopija — povlači se uživo iz Jire pri svakom otvaranju (`server/routes/jira.js`), a od admina
dolazi samo definicija filtera (epic/JQL) i Jira kredencijali vlasnika projekta. Od admina
zavise klijentski tekstovi zadataka (`task_client_texts`) i dnevni snapshot-i, koje inače
popunjava serverski posao posle 22:00.

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

(Tadašnje ograničenje — adminov „pregled kao klijent" sa sirovim statusima — rešeno je
22.09.2026., vidi gore.)

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
2. Odluka: da li i serverski dnevni snapshot da računa podignute statuse (trend i „tempo rada"
   inače odstupaju od onoga što klijent vidi uživo)
3. Faza B iz `docs/SPEC-klijentski-portal.md`: proširiti `TASK_FIELDS` (`updated`,
   `created`, `resolutiondate`, `priority`, `labels`, `fixVersions`, `duedate` — `duedate`
   se povlači ali se ne prikazuje), client-safe istorija promena, izveštaj na zahtev za
   klijenta, higijena (klijentu se i dalje šalju `filterJql`/`filterMeta`)
4. Dva zatečena baga u `ClientNotificationModal.jsx` (nezamenjen `{n}`, dupla strelica)
5. Higijena: stringovi u translations, pino umesto console, odluka o QA kodu
6. Testovi za RBAC i klijentski DTO
7. Release kalendar i dashboard: specifikacija pre koda; sastanak sa Zokom i Novakom

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
