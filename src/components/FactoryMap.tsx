import { useState } from 'react';
import { BUILDINGS, ROOMS, ZONE_COLORS, CATEGORY_ICONS } from '../data/factory';
import type { Room } from '../data/factory';
import appConfig from '../appConfig';

interface FactoryMapProps {
  onRoomSelect?: (room: Room) => void;
  selectedRoomId?: string | null;
}

export const FactoryMap = ({ onRoomSelect, selectedRoomId }: FactoryMapProps) => {
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);

  const getBuildingRooms = (buildingId: string) => {
    return ROOMS.filter(r => r.buildingId === buildingId);
  };

  const handleBuildingClick = (buildingId: string) => {
    setSelectedBuilding(selectedBuilding === buildingId ? null : buildingId);
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span>🏭</span> {appConfig.COMPANY_NAME} - {appConfig.COMPANY_ADDRESS}
        </h3>
        
        <div className="grid grid-cols-5 gap-2 mb-4">
          {BUILDINGS.map((building) => (
            <button
              key={building.id}
              onClick={() => handleBuildingClick(building.id)}
              className={`
                relative p-3 rounded-xl transition-all duration-200
                ${selectedBuilding === building.id 
                  ? 'ring-2 ring-white scale-105' 
                  : 'hover:scale-102'}
              `}
              style={{ backgroundColor: building.color + '40', borderColor: building.color }}
            >
              <div className="text-2xl font-bold text-white">{building.shortName}</div>
              <div className="text-xs text-white/70 truncate">{building.name}</div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-900 text-xs text-white flex items-center justify-center">
                {getBuildingRooms(building.id).length}
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-500/50"></div>
            <span className="text-slate-400">Gluten</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500/50"></div>
            <span className="text-slate-400">Gluten-free</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-slate-500/50"></div>
            <span className="text-slate-400">Neutrální</span>
          </div>
        </div>
      </div>

      {selectedBuilding && (
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <h4 className="text-white font-semibold mb-3">
            Budova {selectedBuilding} - {BUILDINGS.find(b => b.id === selectedBuilding)?.name}
          </h4>
          <div className="grid gap-2">
            {getBuildingRooms(selectedBuilding).map((room) => {
              const zoneStyle = ZONE_COLORS[room.zone];
              const isSelected = selectedRoomId === room.id;
              
              return (
                <button
                  key={room.id}
                  onClick={() => onRoomSelect?.(room)}
                  className={`
                    flex items-center gap-3 p-3 rounded-xl text-left transition-all
                    ${zoneStyle.bg} border ${zoneStyle.border}
                    ${isSelected ? 'ring-2 ring-white' : 'hover:brightness-110'}
                  `}
                >
                  <span className="text-xl">{CATEGORY_ICONS[room.category]}</span>
                  <div className="flex-1">
                    <div className="text-white font-medium">{room.name}</div>
                    <div className="text-xs text-slate-400">
                      {room.id} • {room.floor === 0 ? 'Přízemí' : `${room.floor}. NP`}
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-0.5 rounded ${zoneStyle.text} ${zoneStyle.bg}`}>
                    {room.zone === 'GLUTEN' ? 'GL' : room.zone === 'GLUTEN_FREE' ? 'GF' : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!selectedBuilding && (
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <h4 className="text-white font-semibold mb-3">⚡ Kritické prostory</h4>
          <div className="grid grid-cols-2 gap-2">
            {ROOMS.filter(r => ['D-EXT', 'D-VEL', 'D-MIC', 'D-BAL', 'D-KOT', 'D-KOM', 'E-DIL', 'E-SND'].includes(r.id)).map((room) => {
              const zoneStyle = ZONE_COLORS[room.zone];
              return (
                <button
                  key={room.id}
                  onClick={() => {
                    setSelectedBuilding(room.buildingId);
                    onRoomSelect?.(room);
                  }}
                  className={`
                    flex items-center gap-2 p-2 rounded-lg text-left text-sm
                    ${zoneStyle.bg} border ${zoneStyle.border} hover:brightness-110 transition-all
                  `}
                >
                  <span>{CATEGORY_ICONS[room.category]}</span>
                  <span className="text-white truncate">{room.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FactoryMap;
