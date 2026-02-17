import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, query, orderBy } from 'firebase/firestore';
import type { FleetItem } from '../types/fleet';

const COLLECTION = 'fleet';

export const fleetService = {
  // 1. Naèíst všechna vozidla
  async getAll() {
    const q = query(collection(db, COLLECTION), orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as FleetItem[];
  },

  // 2. Pøidat nové vozidlo
  async add(item: Omit<FleetItem, 'id'>) {
    return await addDoc(collection(db, COLLECTION), item);
  },

  // 3. Nahrát testovací data (pokud je prázdno)
  async seedInitialData() {
    const testData = [
      { name: 'VZV JCB', code: 'VZV-001', category: 'vzv', status: 'operational', manufacturer: 'JCB' },
      { name: 'New Holland Traktor', code: 'AGR-NH', category: 'agri', status: 'operational', manufacturer: 'New Holland' },
      { name: 'Škoda Octavia', code: 'AUTO-01', category: 'vehicle', status: 'maintenance', licensePlate: '5J2 8899' },
      { name: 'Sekaèka', code: 'AGR-SEK', category: 'agri', status: 'broken', manufacturer: 'Honda' },
    ];

    // @ts-ignore
    for (const item of testData) {
      await addDoc(collection(db, COLLECTION), item);
    }
    alert('? Testovací data nahrána do Firebase! Stránka se obnoví.');
    window.location.reload();
  }
};
