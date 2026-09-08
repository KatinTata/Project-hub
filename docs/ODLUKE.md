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
