import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, Timestamp } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDPdaXYoHvU3usmPRurKmlUqNk7atiUEsc',
  authDomain: 'nominal-cmms.firebaseapp.com',
  projectId: 'nominal-cmms',
  storageBucket: 'nominal-cmms.firebasestorage.app',
  messagingSenderId: '756412471928',
  appId: '1:756412471928:web:dd340536ee3e97e2172b8d',
});

const auth = getAuth(app);
const db = getFirestore(app);

async function seed() {
  console.log('🔐 Přihlašuji se jako SUPERADMIN...');
  const cred = await signInWithEmailAndPassword(auth, 'pin_3333@nominal.local', '333300');
  console.log('✅ Přihlášen:', cred.user.email);

  const usersSnap = await getDocs(collection(db, 'users'));
  const usersMap: Record<string, { id: string; name: string; color: string }> = {};
  usersSnap.docs.forEach(doc => {
    const d = doc.data();
    if (d.pin) usersMap[d.pin] = { id: doc.id, name: d.displayName || '', color: d.color || '#64748b' };
  });

  console.log(`📋 Nalezeno ${Object.keys(usersMap).length} uživatelů:`);
  Object.entries(usersMap).forEach(([pin, u]) => console.log(`   PIN ${pin} → ${u.name} (${u.id})`));

  const U = {
    vilem:   usersMap['3333'] || { id: 'x', name: 'Vilém', color: '#16a34a' },
    zdenek:  usersMap['5555'] || { id: 'x', name: 'Zdeněk', color: '#64748b' },
    petr:    usersMap['6666'] || { id: 'x', name: 'Petr', color: '#0ea5e9' },
    pavla:   usersMap['4444'] || { id: 'x', name: 'Pavla', color: '#a855f7' },
    milan:   usersMap['1111'] || { id: 'x', name: 'Milan', color: '#f59e0b' },
    filip:   usersMap['7777'] || { id: 'x', name: 'Filip', color: '#ef4444' },
    martina: usersMap['2222'] || { id: 'x', name: 'Martina', color: '#ec4899' },
    kiosk:   usersMap['0000'] || { id: 'x', name: 'Kiosk', color: '#6b7280' },
  };

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const ts = (d: Date) => Timestamp.fromDate(d);

  console.log('\n🚀 Vytvářím 15 úkolů...\n');

  const tasks: Record<string, any>[] = [
    { code:'WO-2026-001', title:'Výměna ložiska na Extruderu 3', description:'Hlučné ložisko SKF 6205, vibrace nad limitem.', type:'corrective', status:'in_progress', priority:'P1', source:'web', assetId:'STR_003', assetName:'Extruder 3', buildingId:'D', assigneeId:U.vilem.id, assigneeName:U.vilem.name, assigneeColor:U.vilem.color, createdById:U.zdenek.id, createdByName:U.zdenek.name, createdAt:ts(new Date(now-1*DAY)), startedAt:ts(new Date(now-0.5*DAY)), estimatedMinutes:120, actualMinutes:45, updatedAt:ts(new Date()) },
    { code:'WO-2026-002', title:'Balička Karel — zasekávání fólie', description:'Fólie se trhá při vysoké rychlosti.', type:'corrective', status:'backlog', priority:'P1', source:'kiosk', assetId:'STR_053', assetName:'Balička Karel', buildingId:'D', createdById:U.kiosk.id, createdByName:'Operátor (kiosk)', createdAt:ts(new Date(now-0.2*DAY)), estimatedMinutes:90, updatedAt:ts(new Date()) },
    { code:'WO-2026-003', title:'Kontrola oleje KGJ', description:'Pravidelná kontrola oleje a filtrů.', type:'preventive', status:'planned', priority:'P2', source:'web', assetId:'STR_058', assetName:'Kogenerační jednotka', buildingId:'D', assigneeId:U.vilem.id, assigneeName:U.vilem.name, assigneeColor:U.vilem.color, createdById:U.vilem.id, createdByName:U.vilem.name, createdAt:ts(new Date(now-5*DAY)), plannedDate:ts(new Date(now+1*DAY)), estimatedMinutes:45, plannedWeek:'2026-W08', updatedAt:ts(new Date()) },
    { code:'WO-2026-004', title:'Výměna řemene na míchačce', description:'Řemen prokluzuje, snížený výkon.', type:'corrective', status:'planned', priority:'P2', source:'web', assetId:'STR_050', assetName:'Míchárna I', buildingId:'D', assigneeId:U.zdenek.id, assigneeName:U.zdenek.name, assigneeColor:U.zdenek.color, createdById:U.pavla.id, createdByName:U.pavla.name, createdAt:ts(new Date(now-3*DAY)), plannedDate:ts(new Date(now+2*DAY)), estimatedMinutes:60, plannedWeek:'2026-W08', updatedAt:ts(new Date()) },
    { code:'WO-2026-005', title:'Oprava úniku oleje — Extruder 7', description:'Čekáme na těsnění z objednávky.', type:'corrective', status:'paused', priority:'P2', source:'web', assetId:'STR_007', assetName:'Extruder 7', buildingId:'D', assigneeId:U.vilem.id, assigneeName:U.vilem.name, assigneeColor:U.vilem.color, createdById:U.zdenek.id, createdByName:U.zdenek.name, createdAt:ts(new Date(now-4*DAY)), startedAt:ts(new Date(now-3*DAY)), pausedAt:ts(new Date(now-1*DAY)), estimatedMinutes:90, updatedAt:ts(new Date()) },
    { code:'WO-2026-006', title:'Revize kompresorů', description:'Roční kontrola kompresoru 1 a 2.', type:'inspection', status:'planned', priority:'P3', source:'web', assetId:'STR_059', assetName:'Kompresor', buildingId:'D', assigneeId:U.zdenek.id, assigneeName:U.zdenek.name, assigneeColor:U.zdenek.color, createdById:U.pavla.id, createdByName:U.pavla.name, createdAt:ts(new Date(now-7*DAY)), plannedDate:ts(new Date(now+5*DAY)), estimatedMinutes:120, plannedWeek:'2026-W09', updatedAt:ts(new Date()) },
    { code:'WO-2026-007', title:'Výměna předfiltrů — Extrudovna I', description:'Plánovaná výměna předfiltrů na extruderech 1-12.', type:'preventive', status:'backlog', priority:'P3', source:'web', assetId:'STR_072', assetName:'Předfiltr sada I', buildingId:'D', createdById:U.vilem.id, createdByName:U.vilem.name, createdAt:ts(new Date(now-10*DAY)), estimatedMinutes:180, updatedAt:ts(new Date()) },
    { code:'WO-2026-008', title:'Kontrola VZT jednotek', description:'Čtvrtletní kontrola filtrů a ventilátorů.', type:'inspection', status:'backlog', priority:'P3', source:'web', assetId:'STR_065', assetName:'VZT jednotka 1', buildingId:'D', createdById:U.martina.id, createdByName:U.martina.name, createdAt:ts(new Date(now-12*DAY)), estimatedMinutes:90, updatedAt:ts(new Date()) },
    { code:'WO-2026-009', title:'Mazání převodovek — měsíční', type:'preventive', status:'backlog', priority:'P3', source:'web', assetId:'STR_078', assetName:'Převodovka sada', buildingId:'D', createdById:U.vilem.id, createdByName:U.vilem.name, createdAt:ts(new Date(now-2*DAY)), estimatedMinutes:60, updatedAt:ts(new Date()) },
    { code:'WO-2026-010', title:'Instalace senzoru teploty v míchacím centru', description:'Nápad od Milana — monitoring teploty.', type:'improvement', status:'backlog', priority:'P4', source:'web', buildingId:'D', createdById:U.milan.id, createdByName:U.milan.name, createdAt:ts(new Date(now-20*DAY)), updatedAt:ts(new Date()) },
    { code:'WO-2026-011', title:'QR kódy na všechny stroje', description:'Vytisknout a nalepit QR kódy pro AssetCard.', type:'improvement', status:'backlog', priority:'P4', source:'web', createdById:U.vilem.id, createdByName:U.vilem.name, createdAt:ts(new Date(now-15*DAY)), estimatedMinutes:240, updatedAt:ts(new Date()) },
    { code:'WO-2026-012', title:'Oprava úniku vzduchu — kompresor 2', type:'corrective', status:'completed', priority:'P2', source:'web', assetId:'STR_060', assetName:'Kompresor 2', buildingId:'D', assigneeId:U.vilem.id, assigneeName:U.vilem.name, assigneeColor:U.vilem.color, createdById:U.zdenek.id, createdByName:U.zdenek.name, createdAt:ts(new Date(now-8*DAY)), completedAt:ts(new Date(now-6*DAY)), estimatedMinutes:45, actualMinutes:30, resolution:'Vyměněn O-kroužek na výstupním ventilu. Tlak stabilní.', updatedAt:ts(new Date()) },
    { code:'WO-2026-013', title:'Kalibrace měřidel — únor', type:'inspection', status:'completed', priority:'P3', source:'web', assetId:'STR_117', assetName:'Měřidla sada', buildingId:'D', assigneeId:U.petr.id, assigneeName:U.petr.name, assigneeColor:U.petr.color, createdById:U.pavla.id, createdByName:U.pavla.name, createdAt:ts(new Date(now-14*DAY)), completedAt:ts(new Date(now-10*DAY)), estimatedMinutes:120, actualMinutes:100, resolution:'Všechna měřidla v normě. 2x váha překalibrována.', updatedAt:ts(new Date()) },
    { code:'WO-2026-014', title:'Výměna žárovek v kotelně', type:'corrective', status:'completed', priority:'P3', source:'web', buildingId:'D', assigneeId:U.filip.id, assigneeName:U.filip.name, assigneeColor:U.filip.color, createdById:U.vilem.id, createdByName:U.vilem.name, createdAt:ts(new Date(now-6*DAY)), completedAt:ts(new Date(now-5*DAY)), estimatedMinutes:30, actualMinutes:20, resolution:'Vyměněny 4x LED trubice.', updatedAt:ts(new Date()) },
    { code:'WO-2026-015', title:'Údržba nabíječky VZV č.3', type:'preventive', status:'cancelled', priority:'P3', source:'web', assetId:'STR_094', assetName:'Nabíječka 3', buildingId:'D', createdById:U.petr.id, createdByName:U.petr.name, createdAt:ts(new Date(now-11*DAY)), resolution:'Zrušeno — nabíječka vyřazena.', updatedAt:ts(new Date()) },
  ];

  let ok = 0;
  for (const task of tasks) {
    try {
      await addDoc(collection(db, 'tasks'), task);
      ok++;
      console.log(`✅ ${task.code}: ${task.title}`);
    } catch (err: any) {
      console.error(`❌ ${task.code}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Hotovo! ${ok}/${tasks.length} úkolů.`);
  process.exit(0);
}

seed().catch(err => { console.error('❌', err.message); process.exit(1); });
