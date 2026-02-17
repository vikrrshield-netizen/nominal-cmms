import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, Camera } from 'lucide-react';

const FacilityDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<any>(null);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      const docRef = doc(db, 'facilities', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) setRoom(docSnap.data());
      const q = query(collection(db, 'facilities'), where('parentId', '==', id));
      const qSnap = await getDocs(q);
      setCheckpoints(qSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    loadData();
  }, [id]);

  if (!room) return <div className="p-10">Naèítám místnost...</div>;

  return (
    <div className="p-4 pb-24 bg-white min-h-screen">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 mb-6 font-medium">
        <ArrowLeft size={20} /> Zpìt
      </button>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{room.name}</h1>
      <div className="space-y-4 mt-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kontrolní body</h3>
        {checkpoints.map((cp) => (
          <div key={cp.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-green-600" size={18} />
              <span className="font-semibold text-slate-700">{cp.name}</span>
            </div>
            <button className="p-3 bg-white rounded-xl border border-slate-200 text-slate-400">
              <Camera size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
export default FacilityDetailPage;
