# RESTORE runbook — Project Insight Hub

Baza je SQLite fajl (`data/tracker.db`, na Railway persistent disku kroz `DATA_DIR`).
Backup ide dnevno (scheduler, od 03:00 Beograd, sa nadoknadom propuštenog prozora):

1. **Lokalno** (uvek): `DATA_DIR/backups/tracker-YYYY-MM-DD.db` — poslednjih 14 dana.
2. **Off-site** (kad su podešene env varijable): šifrovana kopija na S3-kompatibilan
   storage — objekat `BACKUP_S3_PREFIX/tracker-YYYY-MM-DD.db.gz.enc`.

## Env varijable za off-site (Railway → Variables)

| Varijabla | Primer / napomena |
|---|---|
| `BACKUP_S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` (R2), MinIO/B2/AWS endpoint |
| `BACKUP_S3_BUCKET` | naziv bucketa |
| `BACKUP_S3_ACCESS_KEY` / `BACKUP_S3_SECRET_KEY` | S3 kredencijali (samo PutObject je potreban) |
| `BACKUP_S3_REGION` | default `us-east-1` (za R2 koristi `auto`) |
| `BACKUP_S3_PREFIX` | default `project-hub` |
| `BACKUP_ENCRYPTION_KEY` | **64 hex karaktera; ZASEBAN ključ, ne isti kao `ENCRYPTION_KEY`!** Generisanje: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Bez ovih varijabli aplikacija radi normalno — samo preskače off-site korak.

**Retencija off-site kopija:** podesiti *lifecycle pravilo na bucketu* (npr. brisanje
objekata starijih od 90 dana pod prefiksom `project-hub/`). Aplikacija namerno nema
delete pravo na bucketu (ransomware zaštita — ukraden ključ ne može da obriše istoriju).

**Čuvanje ključa:** `BACKUP_ENCRYPTION_KEY` sačuvati i VAN Railway-a (password manager).
Bez ključa off-site kopije su nepovratne.

## Format off-site fajla

`iv (12 B) | GCM auth tag (16 B) | AES-256-GCM( gzip(tracker.db) )`

## Restore — lokalna kopija (najčešći slučaj)

1. Zaustavi aplikaciju (Railway: Service → Settings → Sleep / redeploy kasnije).
2. Na volume-u:
   ```bash
   cp "$DATA_DIR/backups/tracker-YYYY-MM-DD.db" "$DATA_DIR/tracker.db"
   rm -f "$DATA_DIR/tracker.db-wal" "$DATA_DIR/tracker.db-shm"
   ```
3. Pokreni aplikaciju; migracije u `server/db.js` su idempotentne i dopuniće šemu.
4. Smoke test: login (3 role), otvaranje projekta, `/health` vraća `dbOk: true`.

## Restore — off-site kopija

1. Preuzmi objekat `project-hub/tracker-YYYY-MM-DD.db.gz.enc` iz bucketa.
2. Dešifruj i raspakuj (potreban `BACKUP_ENCRYPTION_KEY`):
   ```bash
   node -e "
   const fs=require('fs'),crypto=require('crypto'),zlib=require('zlib');
   const buf=fs.readFileSync(process.argv[1]);
   const key=Buffer.from(process.env.BACKUP_ENCRYPTION_KEY,'hex');
   const d=crypto.createDecipheriv('aes-256-gcm',key,buf.subarray(0,12));
   d.setAuthTag(buf.subarray(12,28));
   fs.writeFileSync('tracker.db',zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)),d.final()])));
   console.log('OK -> tracker.db');
   " tracker-YYYY-MM-DD.db.gz.enc
   ```
3. Proveri integritet: `sqlite3 tracker.db "PRAGMA integrity_check;"` → `ok`.
4. Prebaci fajl na volume kao `tracker.db` (koraci 1–4 iz lokalnog restore-a).

## Test restore-a (uraditi JEDNOM posle podešavanja kredencijala)

1. Sačekaj prvi off-site backup (log: `[backup] off-site OK -> ...`).
2. Na praznoj lokalnoj instanci: preuzmi + dešifruj po postupku iznad,
   stavi kao `data/tracker.db`, pokreni `npm run dev`, uloguj se.
3. Zabeleži datum testa ovde: _test restore obavljen: ____-__-__ (ko: ______)_.
