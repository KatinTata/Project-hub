# Stanje — Project Insight Hub

_Poslednje ažuriranje: 08.09.2026._

## Gde smo
Aplikacija je na produkciji: **project-hub.intelisale.com** (Railway, Nixpacks,
`node server/index.js`, SQLite na persistent disku). Postoji dnevni backup u 03:00
po Beogradu, lokalno 14 dana, plus šifrovana off-site kopija kad su S3 varijable
podešene — runbook je u `RESTORE.md`.

Osnova radi: praćenje Jira projekata, više korisnika sa rolama
(`super_admin` / `admin` / `user`), release notes editor, dokumenti, poruke,
faze i prognoza, AI Usage modul. 38 tabela, 189 testova (svi prolaze).

## Šta je zadnje rađeno (08.09.2026.)
Nova navigacija po Predlogu A (dizajn: https://claude.ai/code/artifact/9f42b3ad-a90d-4304-aa02-2af2856469b1):
- jedan bočni meni (`client/src/components/shell/`): Projekti / Portal / Administracija,
  korisnik na dnu sa Profil / Jezik / Odjava; na mobilnom fioka sa hamburgerom
- tanko zaglavlje strane: nadnaslov (grupa) + naslov + zvonce
- Podešavanja su stranica `/settings/:section` (profil, jezik, Jira, AI, osvežavanje),
  Korisnici i organizacije su stranica `/users` — modali uklonjeni
- samo svetla tema; izbor teme uklonjen; pozadinska animacija ostaje samo na login/loading ekranu
- Topbar i ProjectTabs obrisani; stranice više ne renderuju sopstveni header
- lokalno: build, lint (0 grešaka) i 189 testova prolaze na Node 20 (Homebrew)

**Izmene NISU commitovane** — čekaju potvrdu. Sadržaj budućeg commita je opisan u razgovoru
(`feat(shell): unified sidebar navigation, light theme only`).

Ranije (03–04.09.): klijentski portal (jezik/tema po korisniku, klijentski tekstovi
taskova, pregled kao klijent), AI Usage po servisu i cena po zahtevu za MCP alate.

## Nalazi analize 07.09. koji još čekaju
- ~26 hardkodovanih srpskih stringova van `translations.js` (AssigneeWorkload, ProjectTrend, PhaseForecast, ui/collapse)
- server na 69 mesta piše kroz `console.*` umesto pino
- nema testova za HTTP rute / RBAC / klijentski DTO bez sati
- QAPage + qaData (~600 linija) su mrtav kod od 04.09. — odluka: brisati ili vratiti
- `docs/` i `.claude/` nisu u git-u

## Sledeći korak
1. Commit nove navigacije (po potvrdi), zatim deploy i provera na produkciji
2. Higijena: stringovi u translations, pino umesto console, odluka o QA kodu
3. Testovi za RBAC i klijentski DTO pre daljeg razvoja portala
4. Release kalendar i dashboard: kratka specifikacija u `docs/` pre koda; sastanak sa Zokom i Novakom

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
