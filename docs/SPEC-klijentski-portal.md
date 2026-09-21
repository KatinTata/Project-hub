# Specifikacija — obogaćivanje klijentskog prikaza projekta

_Napisano 14.09.2026. Osnov: analiza koda klijentskog portala (P3-1)._

## Cilj

Klijent danas na stranici projekta dobija procenat završenosti, tri pločice i tri
grafikona. Nedostaje mu odgovor na tri pitanja koja postavlja na svakom sastanku:
**gde smo u planu**, **šta se promenilo od prošlog puta** i **kojim tempom se radi**.
Ova specifikacija pokriva te tri stvari plus sitnu higijenu, bez menjanja politike
da klijent ne vidi interne sate.

## Donete odluke (14.09.2026.)

1. **Tempo se prikazuje bez projektovanog datuma završetka.** Klijent vidi koliko je
   stavki završeno u poslednjih 30 dana i nedeljni prosek. Ne prikazuje se
   „ovim tempom kraj oko DD.MM." — projekcija obavezuje na datum koji se ne drži.
2. **Jira `duedate` po zadatku se povlači, ali se klijentu ne prikazuje.** Polje nije
   pouzdano održavano. Vremenski prikazi se oslanjaju na `updated` i `resolutiondate`.
   Ako se kasnije potvrdi da se `duedate` održava, prikaz se uključuje bez novog rada
   na serveru.

## Obim

### Faza A — postojeći podaci, samo klijentski deo

| # | Stavka | Fajl |
|---|---|---|
| A1 | **Vremenska osa faza**: traka po fazi od `start_date` do `due_date`, marker „danas", bojenje po završenosti. Zamenjuje pločicu „sledeći datum". | nova `client/src/components/portal/PhaseTimeline.jsx` |
| A2 | **Tok „Šta je novo"**: release-ovi, poruke, poslati izveštaji i upozorenja u jednoj hronološkoj listi (poslednjih 10). Zamenjuje tri odvojene pločice. | nova `client/src/components/portal/WhatsNew.jsx` |
| A3 | **Tempo**: iz dnevnih snapshot-a — završeno u poslednjih 30 dana, nedeljni prosek, koliko stavki je ostalo. Bez datuma (odluka 1). | nova `client/src/components/portal/Velocity.jsx` |
| A4 | ~~Dugme „Preuzmi izveštaj"~~ — **premešteno u Fazu B (B4)**: Excel generator (`server/excel/buildReport.js`) je građen oko sati (listovi „Po izvršiocu", „Stekovi", pločice Estimacija/Utrošeno), pa bi klijentska verzija bila tabela nula. Bolji izvor već postoji: `server/reports/progressReport.js` sa profilom `client`. | — |
| A5 | **Sekcija dokumenata** na stranici projekta — poslednjih 5 dokumenata vidljivih tom klijentu. | `ClientOverview.jsx` |
| A6 | **Prevod statusa**: sirovi Jira statusi (`In Review`, `Waiting for deploy`) se klijentu prikazuju kao 4 klijentske reči izvedene iz `statusCategory`. | `translations.js`, `TaskTable.jsx`, `ClientCharts.jsx` |

### Faza B — server

| # | Stavka | Fajl |
|---|---|---|
| B1 | **Proširiti `TASK_FIELDS`**: `created`, `updated`, `resolutiondate`, `priority`, `labels`, `fixVersions`, `duedate`. Sva polja su client-safe (nisu sati ni imena); `duedate` se ne prikazuje (odluka 2). | `server/jiraClient.js`, `client/src/utils.js` |
| B2 | **Client-safe istorija promena**: nova ruta koja za zadatke klijentovog projekta vraća samo prelaze statusa sa datumom — **bez imena autora**. Postojeća `/changelogs` ostaje interna. | `server/routes/jira.js` |
| B4 | **Izveštaj na zahtev za klijenta** — nova ruta koja za zadati period generiše klijentski izveštaj kroz `buildProgressReportData` + `renderProgressReportHtml` (profil `client`) i vrati ga za preuzimanje; dugme u klijentskom pregledu. | `server/routes/reports.js`, `ClientOverview.jsx` |
| B3 | **Higijena**: (a) `GET /api/projects` ne šalje klijentu `filterJql` i `filterMeta`; (b) release note bez `project_id` se više ne prikazuje na svakom projektu. | `server/routes/projects.js`, `ClientOverview.jsx` |

### Ne radi se u ovom prolazu

Kalendar release-ova, vezivanje dokumenata za projekat (`documents.project_id`),
klijentska potvrda (UAT), pregled svih projekata za klijenta sa više projekata,
vraćanje FAQ stranice, grupisanje zadataka po modulima. Ostaje na listi za sledeći krug.

## Pravila koja važe za ceo obim

- Nijedan interni sat, procena, overrun ni ime izvršioca ne izlazi roli `user` —
  client-safe DTO u `server/routes/jira.js` ostaje jedino mesto koje to garantuje;
  skrivanje u UI-ju se ne računa kao zaštita.
- Svaki novi korisnički string ide u `translations.js` (sr + en), ključevi `portal.*`.
- Grafikoni su ručno pisan SVG, bez biblioteka. Samo svetla tema.
- Migracije baze: ovaj obim ih **ne traži** — sve ide iz postojeće šeme.
- Izračun tempa (A3) dobija test u `tests/` — golden-master kao ostali obračuni.


## Stanje realizacije (14.09.2026.)

Faza A je urađena: A1 (vremenska osa), A2 (tok „Šta je novo"), A3 (tempo),
A5 (dokumenta), A6 (prevod statusa — i u koloni statusa i u filter-čipovima).
A4 je premešten u Fazu B iz razloga opisanog u tabeli.

Uz to je iz Faze B odrađena stavka B3(b) — objava bez `project_id` se više ne
prikazuje na svakom projektu klijenta. B1, B2, B3(a) i B4 nisu započeti.

Nalazi iz vizuelne provere koji su odmah ispravljeni:
- „preostalo stavki" se čitalo iz snapshot-a, a donut iz Jire → dve kartice su
  umele da pokažu različit broj za isti projekat; preostalo sada ide iz trenutnih podataka
- izbor osnove za tempo je padao kad je u prozoru od 30 dana postojao samo
  poslednji snimak (test `portal.test.js` to pokriva)

Zatečeni bagovi van obima (prijavljeni, NISU dirani):
- `ClientNotificationModal.jsx:34` — `t('clientNotif.message1')` se zove bez
  `{ n: count }`, pa klijentu u modalu piše doslovno „Imate {n} novu poruku"
- `ClientNotificationModal.jsx:71` — `{t('clientNotif.viewAll')} →`, a prevod
  već sadrži strelicu → prikazuje se „Pogledaj sve → →"
