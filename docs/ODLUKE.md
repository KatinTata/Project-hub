# Odluke — Project Insight Hub

Jedan red = jedna odluka. Ne briše se, samo se dodaje. Ako se odluka menja,
dodaje se novi red koji to kaže.

Redovi ispod su izvučeni iz `CLAUDE.md` i koda 07.09.2026., pa im datum donošenja
nije poznat. Nove odluke od danas nose stvaran datum.

| Datum | Odluka | Zašto |
|---|---|---|
| iz repozitorijuma | SQLite (`better-sqlite3`, WAL) umesto server baze | baza je jedan fajl na persistent disku, backup je kopija fajla |
| iz repozitorijuma | Custom router preko `history.pushState`, bez react-router-a | — |
| iz repozitorijuma | Inline JS stilovi + CSS varijable u `theme.js`, bez CSS fajlova i UI biblioteka | — |
| iz repozitorijuma | Grafikoni kao ručno pisan SVG, bez chart biblioteke | — |
| iz repozitorijuma | Migracije baze su isključivo aditivne, nikad destruktivne | shema od 36 tabela raste na živoj bazi |
| iz repozitorijuma | Svaki korisnički string ide u `translations.js` (sr + en), nikad hardkodovan | — |
| iz repozitorijuma | Railway + Nixpacks za deploy | — |
| iz repozitorijuma | JWT HS256 (7 dana) + bcrypt cost 12 | — |
| 07.09.2026. | Transparentnost je osnova proizvoda, AI usage tracking je dodatak | proizvod se prodaje na transparentnosti, ne na merenju potrošnje |
| 07.09.2026. | Model po tenantu: paket (mesečna naknada sa uključenom potrošnjom kao limitom) ili custom mesečni limit u EUR | — |
| 08.09.2026. | Navigacija: jedan bočni meni (Projekti / Portal / Administracija), korisnik na dnu menija; Podešavanja i Korisnici postaju stranice umesto modala | sve je bilo rasuto po headeru, avataru i dva modala; Hub raste u klijentski portal pa navigacija mora da bude jedno mesto |
| 08.09.2026. | Samo svetla tema; izbor teme se uklanja iz UI-ja | tamna tema nije potrebna, jedan vizuelni jezik za klijentski portal |
| 14.09.2026. | Klijentu se prikazuje tempo rada (završene stavke po nedelji), ali NE i projektovan datum završetka | projekcija iz tempa obavezuje na datum koji se u praksi ne drži |
| 14.09.2026. | Jira `duedate` po zadatku se povlači sa servera, ali se klijentu ne prikazuje | polje nije pouzdano održavano; vremenski prikazi idu na `updated` i `resolutiondate` |
| 21.09.2026. | Klijent u tabeli zadataka NE vidi subtaskove; klik na red otvara pun klijentski opis zadatka | subtaskovi su interna razrada posla i klijentu ne znače ništa, a opis je u redu skraćen na jednu liniju pa se dug tekst nije video |
| 21.09.2026. | Dokumenta se ne prikazuju na stranici projekta — ostaju na svojoj stranici u meniju | sekcija je pokazivala sva dokumenta deljena sa klijentom (nema `documents.project_id`), pa je na stranici projekta obmanjivala |
| 21.09.2026. | Napredak zadatka klijentu = putanja statusa u četiri koraka, ne procenat | server roli `user` ne šalje sate pa je kolona bila prazna; status je jedini podatak koji je i tačan i klijentu razumljiv |
| 21.09.2026. | Klijentu se status glavnog zadatka podiže po subtaskovima (u radu / na testiranju), ali zatvoren subtask ne zatvara glavni zadatak | u Jiri glavni zadatak često ostane u „To Do" dok se radi na subtasku, pa je klijentu izgledalo da se ne radi ništa; zatvaranje ostaje isključivo odluka glavnog zadatka |
| 22.09.2026. | Sekcija „Tempo rada" (delivery pace) uklonjena iz klijentskog portala | ne prati sve što bi trebalo (računa se samo iz dnevnih snimaka broja stavki), pa je pre zbunjivala nego govorila |
| 22.09.2026. | Boje statusa: završeno zeleno, na testiranju plavo, u radu ljubičasto, predstoji sivo | narandžasta za „na testiranju" se izdaleka mešala sa zelenom „završeno" |
| 22.09.2026. | Klijentu keširani podaci projekta stare posle 5 minuta (internom timu i dalje nikad, ima dugme za osvežavanje) | klijent nema dugme za osvežavanje ni auto-refresh, pa mu je keš ostajao zamrznut i posle F5 |
