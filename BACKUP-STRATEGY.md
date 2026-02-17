# NOMINAL CMMS — Zálohovací strategie Firestore

## Předpoklady

```bash
# 1. Nainstaluj gcloud CLI
# https://cloud.google.com/sdk/docs/install

# 2. Přihlas se
gcloud auth login

# 3. Nastav projekt
gcloud config set project nominal-cmms
```

## Krok 1: Vytvoř Storage bucket pro zálohy

```bash
# Bucket v EU regionu (GDPR)
gsutil mb -l europe-west3 gs://nominal-cmms-backups

# Nastav lifecycle — automaticky maž zálohy starší 90 dnů
cat > /tmp/lifecycle.json << 'EOF'
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 90 }
    }
  ]
}
EOF

gsutil lifecycle set /tmp/lifecycle.json gs://nominal-cmms-backups
```

## Krok 2: Manuální záloha (jednorázově)

```bash
# Zálohuj celou databázi
gcloud firestore export gs://nominal-cmms-backups/manual/$(date +%Y-%m-%d)

# Zálohuj jen konkrétní kolekce
gcloud firestore export gs://nominal-cmms-backups/manual/$(date +%Y-%m-%d) \
  --collection-ids=users,assets,tasks,revisions,audit_logs
```

## Krok 3: Automatické denní zálohy (Cloud Scheduler + Cloud Functions)

### Varianta A: Cloud Scheduler + gcloud (doporučeno)

```bash
# 1. Povol potřebné API
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable appengine.googleapis.com

# 2. Vytvoř App Engine app (nutné pro Cloud Scheduler)
gcloud app create --region=europe-west3

# 3. Vytvoř service account pro zálohy
gcloud iam service-accounts create firestore-backup \
  --display-name="Firestore Backup SA"

# 4. Přiřaď práva
gcloud projects add-iam-policy-binding nominal-cmms \
  --member="serviceAccount:firestore-backup@nominal-cmms.iam.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

gcloud projects add-iam-policy-binding nominal-cmms \
  --member="serviceAccount:firestore-backup@nominal-cmms.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# 5. Vytvoř Cloud Function pro zálohu
mkdir -p firestore-backup && cd firestore-backup
```

**index.js:**
```javascript
const { Firestore } = require('@google-cloud/firestore');

const firestore = new Firestore();
const bucket = 'gs://nominal-cmms-backups';

exports.scheduledBackup = async (req, res) => {
  const timestamp = new Date().toISOString().split('T')[0];
  const outputUri = `${bucket}/daily/${timestamp}`;

  try {
    const [response] = await firestore.exportDocuments({
      outputUriPrefix: outputUri,
      collectionIds: [
        'users', 'assets', 'tasks', 'revisions',
        'areas', 'inventory', 'fleet', 'waste',
        'trustbox', 'notifications', 'audit_logs', 'settings'
      ],
    });

    console.log(`Backup started: ${response.name}`);
    res.status(200).send(`Backup started: ${outputUri}`);
  } catch (err) {
    console.error('Backup failed:', err);
    res.status(500).send(`Backup failed: ${err.message}`);
  }
};
```

**package.json:**
```json
{
  "name": "firestore-backup",
  "version": "1.0.0",
  "dependencies": {
    "@google-cloud/firestore": "^7.0.0"
  }
}
```

```bash
# 6. Nasaď funkci
gcloud functions deploy scheduledFirestoreBackup \
  --runtime=nodejs20 \
  --trigger-http \
  --entry-point=scheduledBackup \
  --region=europe-west3 \
  --service-account=firestore-backup@nominal-cmms.iam.gserviceaccount.com \
  --no-allow-unauthenticated

# 7. Vytvoř scheduler job — každý den ve 2:00 CET
gcloud scheduler jobs create http firestore-daily-backup \
  --schedule="0 2 * * *" \
  --time-zone="Europe/Prague" \
  --uri="https://europe-west3-nominal-cmms.cloudfunctions.net/scheduledFirestoreBackup" \
  --http-method=GET \
  --oidc-service-account-email=firestore-backup@nominal-cmms.iam.gserviceaccount.com
```

### Varianta B: Jednoduchý cron na serveru (pokud máš VPS)

```bash
# Přidej do crontab
crontab -e

# Každý den ve 2:00
0 2 * * * gcloud firestore export gs://nominal-cmms-backups/daily/$(date +\%Y-\%m-\%d) --project=nominal-cmms 2>&1 | logger -t firestore-backup
```

## Krok 4: Obnovení ze zálohy

```bash
# Zjisti dostupné zálohy
gsutil ls gs://nominal-cmms-backups/daily/

# Obnov celou databázi
gcloud firestore import gs://nominal-cmms-backups/daily/2026-02-16

# Obnov jen konkrétní kolekce
gcloud firestore import gs://nominal-cmms-backups/daily/2026-02-16 \
  --collection-ids=tasks,assets
```

## Krok 5: Monitoring

```bash
# Ověř že scheduler běží
gcloud scheduler jobs list

# Podívej se na logy
gcloud functions logs read scheduledFirestoreBackup --limit=10

# Zkontroluj zálohy v bucketu
gsutil ls -l gs://nominal-cmms-backups/daily/ | tail -5
```

## Shrnutí

| Co | Kde | Kdy |
|---|---|---|
| Denní záloha | `gs://nominal-cmms-backups/daily/` | 2:00 CET |
| Manuální záloha | `gs://nominal-cmms-backups/manual/` | Na vyžádání |
| Retence | 90 dnů | Automatický lifecycle |
| Region | europe-west3 (Frankfurt) | GDPR compliant |

## Cena (odhad)

| Služba | Cena/měsíc |
|---|---|
| Cloud Storage (1 GB) | ~$0.02 |
| Cloud Scheduler (1 job) | Zdarma (3 joby free) |
| Cloud Function (1x/den) | Zdarma (2M invocations free) |
| Firestore export | Zdarma (standardní čtení) |
| **Celkem** | **~$0.02/měsíc** |
