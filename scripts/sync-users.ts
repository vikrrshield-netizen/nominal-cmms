import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

const USERS = [
  { pin: '1111', displayName: 'Milan Novak', role: 'MAJITEL', color: '#f59e0b' },
  { pin: '2222', displayName: 'Martina', role: 'VEDENI', color: '#3b82f6' },
  { pin: '3333', displayName: 'Vilem', role: 'SUPERADMIN', color: '#16a34a' },
  { pin: '4444', displayName: 'Pavla Drapelova', role: 'VYROBA', color: '#d97706' },
  { pin: '5555', displayName: 'Zdenek Micka', role: 'UDRZBA', color: '#64748b' },
  { pin: '6666', displayName: 'Petr Volf', role: 'UDRZBA', color: '#0ea5e9' },
  { pin: '7777', displayName: 'Filip Novak', role: 'UDRZBA', color: '#8b5cf6' },
  { pin: '0000', displayName: 'Kiosk Velin', role: 'OPERATOR', color: '#6b7280' },
];

async function main() {
  console.log('Deleting old auth users...');
  try {
    const list = await auth.listUsers(100);
    for (const u of list.users) {
      await auth.deleteUser(u.uid);
      console.log('  Deleted:', u.email);
    }
  } catch(e: any) { console.log('  No users to delete'); }

  console.log('Deleting old firestore user docs...');
  const snap = await db.collection('users').get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();

  console.log('Creating new users...');
  const now = Timestamp.now();
  for (const user of USERS) {
    const email = `pin_${user.pin}@nominal.local`;
    const password = `${user.pin}00`;
    const authUser = await auth.createUser({ email, password, displayName: user.displayName, disabled: false });
    await auth.setCustomUserClaims(authUser.uid, { role: user.role, plantId: 'kozlov' });
    await db.collection('users').doc(authUser.uid).set({
      displayName: user.displayName, pin: user.pin, role: user.role, color: user.color,
      email, phone: '', active: true, plantId: 'kozlov', createdAt: now, updatedAt: now,
    });
    console.log(`  OK ${user.displayName.padEnd(20)} PIN:${user.pin} Role:${user.role.padEnd(12)} UID:${authUser.uid}`);
  }
  console.log('DONE!');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
