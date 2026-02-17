// NOMINAL CMMS — Integrace 3 chirurgických zásahů
// ================================================
// Tento soubor NESPOUŠTĚJ — je to návod pro Claude Code
// nebo ruční editaci TasksPage.tsx a KioskPage.tsx.
//
// Soubor zkopíruj do kořene projektu jako INTEGRATION-GUIDE.md
// a použij při editaci.

// ═══════════════════════════════════════════════════
// 1. SAVE DRAFT — TasksPage.tsx (nový úkol)
// ═══════════════════════════════════════════════════

// PŘED (v modálu nového úkolu):
//   const [title, setTitle] = useState('');
//   const [description, setDescription] = useState('');
//   const [priority, setPriority] = useState<string>('P3');

// PO:
//   import { useFormDraft } from '../hooks/useFormDraft';
//   
//   const [form, setForm, clearDraft] = useFormDraft('new_task', {
//     title: '',
//     description: '',
//     priority: 'P3',
//     assetId: '',
//   });
//   
//   // Místo setTitle('xxx') → setForm(prev => ({ ...prev, title: 'xxx' }))
//   // Po úspěšném uložení → clearDraft()

// SAVE DRAFT — KioskPage.tsx (hlášení poruchy):
//   const [form, setForm, clearDraft] = useFormDraft('kiosk_fault', {
//     description: '',
//     assetId: '',
//   });
//   // Po odeslání → clearDraft()


// ═══════════════════════════════════════════════════
// 2. MANDATORY FIELDS — TasksPage.tsx (dokončení)
// ═══════════════════════════════════════════════════

// PŘED (v task kartě):
//   <button onClick={() => markAsDone(task.id)}>
//     Hotovo
//   </button>

// PO:
//   import CompleteTaskModal from '../components/ui/CompleteTaskModal';
//   
//   const [completingTask, setCompletingTask] = useState<Task | null>(null);
//   
//   // V renderování karty:
//   <button onClick={() => setCompletingTask(task)}>
//     Dokončit
//   </button>
//   
//   // Pod task listem:
//   {completingTask && (
//     <CompleteTaskModal
//       taskTitle={completingTask.title}
//       onConfirm={async (data) => {
//         await updateDoc(doc(db, 'tasks', completingTask.id), {
//           isDone: true,
//           resolution: data.resolution,
//           durationMinutes: data.durationMinutes,
//           completedAt: serverTimestamp(),
//           completedBy: user?.displayName || 'Neznámý',
//           updatedAt: serverTimestamp(),
//         });
//         setCompletingTask(null);
//       }}
//       onClose={() => setCompletingTask(null)}
//     />
//   )}


// ═══════════════════════════════════════════════════
// 3. STATUS LOCK — TasksPage.tsx (UI blokace)
// ═══════════════════════════════════════════════════

// V task kartě — pokud isDone, zamkni editaci:
//
//   const isLocked = task.isDone === true;
//   const canUnlock = hasPermission('admin.full'); // jen SUPERADMIN
//   
//   // Podmíněný render:
//   {isLocked && !canUnlock ? (
//     // READ-ONLY karta
//     <div className="opacity-60 pointer-events-none">
//       <span className="text-emerald-400 text-xs">✓ Uzavřeno</span>
//       {task.resolution && (
//         <p className="text-sm text-slate-400 mt-1">
//           Řešení: {task.resolution}
//         </p>
//       )}
//       {task.durationMinutes && (
//         <p className="text-xs text-slate-500">
//           Čas: {task.durationMinutes} min
//         </p>
//       )}
//     </div>
//   ) : (
//     // Normální editovatelná karta
//     <div>...</div>
//   )}


// ═══════════════════════════════════════════════════
// FIRESTORE RULES — spustit po editaci
// ═══════════════════════════════════════════════════
// 
// 1. Edituj firestore.rules (viz firestore-rules-patch.ts)
// 2. firebase deploy --only firestore:rules
// 3. Hotovo


// ═══════════════════════════════════════════════════
// TYPES UPDATE — přidat do src/types/firestore.ts
// ═══════════════════════════════════════════════════
//
// Do Task interface přidej:
//   resolution?: string;          // Popis řešení (povinný při uzavření)
//   durationMinutes?: number;     // Čas práce v minutách
//   completedAt?: Timestamp;      // Kdy bylo dokončeno
//   completedBy?: string;         // Kdo dokončil
