import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Home, MapPin, ChevronRight, Building2, ArrowLeft } from 'lucide-react';

const FacilityListPage = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'facilities'));
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setItems(data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-10 text-center">Na��t�m spr�vu budov...</div>;

  const buildings = items.filter(i => i.type === 'Budova' || !i.parentId);
  const rooms = items.filter(i => i.type === 'M�stnost');

  return (
    <div className="p-4 pb-24 bg-slate-50 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 transition">
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="text-blue-600" /> Správa budov
        </h1>
      </div>

      {buildings.map(building => (
        <div key={building.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-4 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b font-bold flex items-center gap-2 text-slate-800">
            <Home size={18} className="text-blue-500" /> {building.name}
          </div>
          <div className="divide-y">
            {rooms.filter(r => 
              r.parentId === building.id || 
              r.parentId === building.name || 
              (r.parentId && building.name.includes(r.parentId))
            ).map(room => (
              <button 
                key={room.id} 
                className="w-full p-4 flex justify-between items-center hover:bg-blue-50 transition-colors"
                onClick={() => navigate(`/facilities/${room.id}`)}
              >
                <div className="flex items-center gap-3">
                  <MapPin size={18} className="text-slate-400" />
                  <span className="text-slate-700 font-medium">{room.name}</span>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
export default FacilityListPage;
