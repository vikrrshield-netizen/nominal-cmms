// src/components/dashboard/SemaphoreWidget.tsx
// VIKRR — Asset Shield — Traffic-light semaphore (Critical, Maintenance, Waste)

interface SemaphoreWidgetProps {
  stats: { breakdownAssets: number; criticalTasks: number; maintenanceAssets: number };
  wasteRed: number;
}

export default function SemaphoreWidget({ stats, wasteRed }: SemaphoreWidgetProps) {
  const criticalTotal = stats.breakdownAssets + stats.criticalTasks;
  const items = [
    {
      label: 'Kritické',
      value: criticalTotal,
      color: criticalTotal > 0 ? 'bg-red-500' : 'bg-emerald-500',
      textColor: criticalTotal > 0 ? 'text-red-400' : 'text-emerald-400',
      bgColor: criticalTotal > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30',
    },
    {
      label: 'Údržba',
      value: stats.maintenanceAssets,
      color: stats.maintenanceAssets > 0 ? 'bg-amber-500' : 'bg-emerald-500',
      textColor: stats.maintenanceAssets > 0 ? 'text-amber-400' : 'text-emerald-400',
      bgColor: stats.maintenanceAssets > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30',
    },
    {
      label: 'Odpady',
      value: wasteRed,
      color: wasteRed > 0 ? 'bg-orange-500' : 'bg-emerald-500',
      textColor: wasteRed > 0 ? 'text-orange-400' : 'text-emerald-400',
      bgColor: wasteRed > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-emerald-500/10 border-emerald-500/30',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-1 mb-4">
      {items.map((item) => (
        <div key={item.label} className={`rounded-xl p-1 border ${item.bgColor} text-center`}>
          <div className="flex items-center justify-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.color} ${item.value > 0 ? 'animate-pulse' : ''}`} />
            <span className={`text-lg font-bold leading-none ${item.textColor}`}>{item.value}</span>
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
