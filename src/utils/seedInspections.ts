// src/utils/seedInspections.ts
// Seed inspections collection from browser (using existing Firebase client)

import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const INSPECTIONS = [
  // Budova D — 1.NP
  { roomCode: 'D 1.01', roomName: 'Kotelna', floor: '1.NP', buildingId: 'D', description: 'kontrola kotlů, tlaky, úniky, manometry', category: 'energie' },
  { roomCode: 'D 1.02', roomName: 'Míchárna I.', floor: '1.NP', buildingId: 'D', description: 'podlahy, stěny, osvětlení, stroje, čistota', category: 'výroba' },
  { roomCode: 'D 1.05', roomName: 'Míchárna II.', floor: '1.NP', buildingId: 'D', description: 'podlahy, stěny, osvětlení, stroje, čistota', category: 'výroba' },
  { roomCode: 'D 1.06', roomName: 'Mycí místnost', floor: '1.NP', buildingId: 'D', description: 'odpad podlaha, hadice na vodu, dřez', category: 'hygiena' },
  { roomCode: 'D 1.08', roomName: 'Sklad surovin', floor: '1.NP', buildingId: 'D', description: 'regály, štítky, teplota, čistota', category: 'sklad' },
  { roomCode: 'D 1.09', roomName: 'Sklad obalů', floor: '1.NP', buildingId: 'D', description: 'regály, palety, čistota, přístupnost', category: 'sklad' },
  { roomCode: 'D 1.12', roomName: 'Balírna — vstup', floor: '1.NP', buildingId: 'D', description: 'dveře, podlaha, hygienická zóna', category: 'výroba' },
  { roomCode: 'D 1.13', roomName: 'Balírna', floor: '1.NP', buildingId: 'D', description: 'baličky, kartonovačky, čistota, teplota', category: 'výroba' },
  { roomCode: 'D 1.13a', roomName: 'Balírna — gluten-free', floor: '1.NP', buildingId: 'D', description: 'separace alergenů, čistota, štítky', category: 'výroba' },
  { roomCode: 'D 1.14', roomName: 'Výrobní hala — hlavní', floor: '1.NP', buildingId: 'D', description: 'vizuální kontrola podlah, funkčnosti dveří a světel', category: 'budova' },
  { roomCode: 'D 1.15', roomName: 'Výtah expedice', floor: '1.NP', buildingId: 'D', description: 'poškození dveří kabiny, funkčnost tlačítek', category: 'budova' },
  { roomCode: 'D 1.16', roomName: 'Kompresory', floor: '1.NP', buildingId: 'D', description: 'tlaky, olej, filtry, teplota, Mth', category: 'energie' },
  { roomCode: 'D 1.17', roomName: 'Předfiltry', floor: '1.NP', buildingId: 'D', description: 'stav filtrů, tlakový spád, výměna', category: 'energie' },
  { roomCode: 'D 1.18', roomName: 'Nabíječky VZV', floor: '1.NP', buildingId: 'D', description: 'kabely, konektory, nabíjení, ventilace', category: 'energie' },
  { roomCode: 'D 1.21', roomName: 'WC řidiči', floor: '1.NP', buildingId: 'D', description: 'kontrola vlhkosti, kohoutky, odpad', category: 'hygiena' },
  { roomCode: 'D 1.23', roomName: 'Expedice', floor: '1.NP', buildingId: 'D', description: 'trubky topení, hmyzolapače, vrata 4x, hasičák', category: 'budova' },
  { roomCode: 'D 1.24', roomName: 'Kancelář skladník', floor: '1.NP', buildingId: 'D', description: 'síť v okně, celistvost soklů a zdí', category: 'budova' },
  { roomCode: 'D 1.25', roomName: 'Údržba, mycí centrum', floor: '1.NP', buildingId: 'D', description: 'odpad podlaha, kontrola dřezu, hadice na vodu', category: 'hygiena' },
  // Budova D — 2.NP
  { roomCode: 'D 2.01', roomName: 'Velín extruze', floor: '2.NP', buildingId: 'D', description: 'obrazovky, ovládání, čistota, klimatizace', category: 'výroba' },
  { roomCode: 'D 2.02', roomName: 'Extrudovna II.', floor: '2.NP', buildingId: 'D', description: 'extrudery, dopravníky, teploty, čistota', category: 'výroba' },
  { roomCode: 'D 2.03', roomName: 'VZT místnost', floor: '2.NP', buildingId: 'D', description: 'VZT jednotky, filtry, řemeny', category: 'energie' },
  // Budova C
  { roomCode: 'C 1.03', roomName: 'Jídelna', floor: '1.NP', buildingId: 'C', description: 'stoly, židle, výdejní okénko, čistota', category: 'zázemí' },
  { roomCode: 'C 1.07', roomName: 'Šatna muži', floor: '1.NP', buildingId: 'C', description: 'skříňky, sprchy, osvětlení, odvětrání', category: 'zázemí' },
  { roomCode: 'C 1.13', roomName: 'Šatna ženy', floor: '1.NP', buildingId: 'C', description: 'skříňky, sprchy, osvětlení, odvětrání', category: 'zázemí' },
  { roomCode: 'C 1.17', roomName: 'Kanceláře vedení', floor: '1.NP', buildingId: 'C', description: 'okna, topení, osvětlení, nábytek', category: 'zázemí' },
  { roomCode: 'C 1.18', roomName: 'Zasedací místnost', floor: '1.NP', buildingId: 'C', description: 'projektor, stůl, židle, klimatizace', category: 'zázemí' },
  // Budova A
  { roomCode: 'A 1.01', roomName: 'Recepce', floor: '1.NP', buildingId: 'A', description: 'vstupní dveře, zámky, osvětlení, kamera', category: 'budova' },
  // Budova E
  { roomCode: 'E 1.01', roomName: 'Dílna údržby', floor: '1.NP', buildingId: 'E', description: 'nářadí, svěráky, brusky, čistota, bezpečnost', category: 'údržba' },
  { roomCode: 'E 1.02', roomName: 'Sklad ND', floor: '1.NP', buildingId: 'E', description: 'regály, štítky, inventura, přístupnost', category: 'sklad' },
  { roomCode: 'E 1.03', roomName: 'Garáž', floor: '1.NP', buildingId: 'E', description: 'vrata, osvětlení, odsávání, nářadí', category: 'údržba' },
];

export async function seedInspections(): Promise<string> {
  try {
    // Clear existing
    const existing = await getDocs(collection(db, 'inspections'));
    if (existing.docs.length > 0) {
      const batch = writeBatch(db);
      existing.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Create new
    const batch = writeBatch(db);
    INSPECTIONS.forEach((insp, i) => {
      const ref = doc(collection(db, 'inspections'));
      batch.set(ref, {
        ...insp,
        status: 'pending',
        lastInspectedAt: null,
        lastInspectedBy: null,
        issueNote: null,
        order: i,
        createdAt: new Date(),
      });
    });

    await batch.commit();
    return `✅ Seeded ${INSPECTIONS.length} inspection points`;
  } catch (err: any) {
    return `❌ Error: ${err.message}`;
  }
}
