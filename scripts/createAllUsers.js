const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const users = [
  { pin: '1111', name: 'Vilém', role: 'SUPERADMIN' },
  { pin: '2222', name: 'Pavla Drápelová', role: 'SCHVALOVATEL' },
  { pin: '3333', name: 'Milan Novák', role: 'VIZIONAR' },
  { pin: '4444', name: 'Petr Volf', role: 'HYBRIDNI' },
  { pin: '5555', name: 'Zdeněk Mička', role: 'TECHNIK' },
  { pin: '6666', name: 'Filip Novák', role: 'FLEET' },
  { pin: '7777', name: 'Martina Koláčná', role: 'VIZIONAR' },
];

async function createOrUpdateUser(pin, displayName, role) {
  const email = `pin_${pin}@nominal.local`;
  const password = pin + '00';
  
  try {
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
      console.log(`  Existuje: ${email}`);
    } catch (e) {
      user = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: displayName,
      });
      console.log(`  Vytvoren: ${email}`);
    }
    
    await admin.auth().setCustomUserClaims(user.uid, {
      role: role,
      plantId: 'kozlov'
    });
    
    await admin.auth().updateUser(user.uid, {
      displayName: displayName
    });
    
    console.log(`  Role: ${role}`);
    return true;
  } catch (error) {
    console.error(`  Chyba: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n=== NOMINAL CMMS - Uzivatele ===\n');
  
  for (const u of users) {
    console.log(`${u.name} (PIN: ${u.pin})`);
    await createOrUpdateUser(u.pin, u.name, u.role);
    console.log('');
  }
  
  console.log('=== Hotovo ===\n');
  console.log('Jmeno              | PIN  | Role');
  console.log('-------------------|------|-------------');
  users.forEach(u => {
    console.log(`${u.name.padEnd(18)} | ${u.pin} | ${u.role}`);
  });
  
  process.exit(0);
}

main();
