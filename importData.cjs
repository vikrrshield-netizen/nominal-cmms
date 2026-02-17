const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function loadCsv(fileName) {
  const results = [];
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(fileName)) {
      console.warn(`⚠️ Soubor ${fileName} nenalezen.`);
      return resolve([]);
    }
    fs.createReadStream(fileName)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

async function runImport() {
  try {
    const hierarchy = await loadCsv('budova_CD_hierarchy_1.csv');
    const textData = await loadCsv('budova_textova_data.csv');

    const batch = db.batch();
    hierarchy.forEach((row) => {
      const id = row.ID || row.id;
      if (!id) return;
      const extra = textData.find(t => (t.ID || t.id) === id) || {};
      const docRef = db.collection('facilities').doc(id);
      batch.set(docRef, {
        name: row.Name || row.name || 'Bez názvu',
        parentId: row.ParentID || row.parentId || null,
        type: row.Category || 'room',
        description: extra.Description || extra.popis || '',
        status: 'active'
      });
    });
    await batch.commit();
    console.log(`✅ HOTOVO! Data jsou ve Firebase.`);
    process.exit();
  } catch (error) {
    console.error('❌ Chyba:', error);
    process.exit(1);
  }
}

runImport();