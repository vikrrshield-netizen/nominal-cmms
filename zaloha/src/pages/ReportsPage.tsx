// src/pages/ReportsPage.tsx
// NOMINAL CMMS — Reporty a statistiky s exportem

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { 
  BarChart3, TrendingUp, TrendingDown,
  FileSpreadsheet, FileText, ArrowLeft,
  Wrench, Clock, AlertTriangle,
  PieChart, Activity
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES & DATA
// ═══════════════════════════════════════════════════════════════════

interface ReportData {
  label: string;
  value: number;
  change?: number;
  color: string;
}

const TASK_STATS: ReportData[] = [
  { label: 'Dokončeno', value: 47, change: 12, color: 'bg-emerald-500' },
  { label: 'Probíhá', value: 8, change: -2, color: 'bg-amber-500' },
  { label: 'V backlogu', value: 15, change: 5, color: 'bg-slate-400' },
  { label: 'Zrušeno', value: 3, change: 0, color: 'bg-red-400' },
];

const MONTHLY_DATA = [
  { month: 'Říjen', completed: 38, created: 42 },
  { month: 'Listopad', completed: 45, created: 41 },
  { month: 'Prosinec', completed: 32, created: 35 },
  { month: 'Leden', completed: 51, created: 48 },
  { month: 'Únor', completed: 47, created: 52 },
];

const CATEGORY_DATA = [
  { name: 'Opravy', value: 45, color: 'bg-red-500' },
  { name: 'Preventivní', value: 30, color: 'bg-blue-500' },
  { name: 'Kontroly', value: 15, color: 'bg-amber-500' },
  { name: 'Zlepšení', value: 10, color: 'bg-emerald-500' },
];

const MACHINE_DOWNTIME = [
  { name: 'Balička Karel', hours: 24, incidents: 3 },
  { name: 'Extruder 1', hours: 8, incidents: 1 },
  { name: 'Míchačka 3', hours: 12, incidents: 2 },
  { name: 'Kompresor 2', hours: 4, incidents: 1 },
];

const TOP_TECHNICIANS = [
  { name: 'Vilém', tasks: 28, avgTime: 45, color: '#16a34a' },
  { name: 'Zdeněk', tasks: 22, avgTime: 52, color: '#64748b' },
  { name: 'Petr', tasks: 18, avgTime: 38, color: '#0ea5e9' },
];

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function ReportsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'machines' | 'team'>('overview');

  const canExport = hasPermission('report.export');

  const handleExport = (format: 'excel' | 'pdf') => {
    // Mock export
    alert(`Export do ${format.toUpperCase()} bude implementován s Firebase`);
  };

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 pb-24">
        {/* Header */}
        <header className="p-6">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Dashboard
          </button>
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/25">
                <BarChart3 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Reporty & Statistiky</h1>
                <p className="text-slate-400 text-sm">Přehled výkonnosti údržby</p>
              </div>
            </div>

            {canExport && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport('excel')}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { id: 'week', label: 'Týden' },
              { id: 'month', label: 'Měsíc' },
              { id: 'quarter', label: 'Čtvrtletí' },
              { id: 'year', label: 'Rok' },
            ].map(range => (
              <button
                key={range.id}
                onClick={() => setDateRange(range.id as any)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  dateRange === range.id 
                    ? 'bg-white text-slate-900' 
                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </header>

        {/* Tabs */}
        <div className="px-6 mb-6">
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {[
              { id: 'overview', label: 'Přehled', icon: PieChart },
              { id: 'tasks', label: 'Úkoly', icon: Wrench },
              { id: 'machines', label: 'Stroje', icon: Activity },
              { id: 'team', label: 'Tým', icon: Clock },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id 
                    ? 'bg-white text-slate-900' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 space-y-6">
          {activeTab === 'overview' && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {TASK_STATS.map((stat, i) => (
                  <div key={i} className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                    <div className={`w-3 h-3 rounded-full ${stat.color} mb-3`} />
                    <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                    <div className="text-sm text-slate-400">{stat.label}</div>
                    {stat.change !== undefined && stat.change !== 0 && (
                      <div className={`flex items-center gap-1 mt-2 text-xs ${
                        stat.change > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {stat.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {stat.change > 0 ? '+' : ''}{stat.change} tento měsíc
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Monthly Trend */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Měsíční trend</h3>
                <div className="space-y-3">
                  {MONTHLY_DATA.map((month, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <span className="w-20 text-sm text-slate-400">{month.month}</span>
                      <div className="flex-1 flex gap-1 h-6">
                        <div 
                          className="bg-emerald-500 rounded-l"
                          style={{ width: `${(month.completed / 60) * 100}%` }}
                          title={`Dokončeno: ${month.completed}`}
                        />
                        <div 
                          className="bg-blue-500 rounded-r"
                          style={{ width: `${(month.created / 60) * 100}%` }}
                          title={`Vytvořeno: ${month.created}`}
                        />
                      </div>
                      <span className="text-sm text-slate-400 w-16 text-right">
                        {month.completed}/{month.created}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-emerald-500 rounded" /> Dokončeno
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-blue-500 rounded" /> Vytvořeno
                  </span>
                </div>
              </div>

              {/* Categories */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Rozdělení dle typu</h3>
                <div className="flex gap-2 mb-4">
                  {CATEGORY_DATA.map((cat, i) => (
                    <div 
                      key={i}
                      className={`h-4 ${cat.color} first:rounded-l-full last:rounded-r-full`}
                      style={{ width: `${cat.value}%` }}
                      title={`${cat.name}: ${cat.value}%`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORY_DATA.map((cat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${cat.color}`} />
                      <span className="text-sm text-slate-400">{cat.name}</span>
                      <span className="text-sm font-medium text-white ml-auto">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'tasks' && (
            <>
              {/* Task completion rate */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-2">Úspěšnost dokončení</h3>
                <div className="flex items-end gap-4">
                  <span className="text-5xl font-bold text-emerald-400">87%</span>
                  <span className="text-slate-400 mb-2">úkolů dokončeno včas</span>
                </div>
                <div className="mt-4 h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" style={{ width: '87%' }} />
                </div>
              </div>

              {/* Average resolution time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <Clock className="w-6 h-6 text-blue-400 mb-2" />
                  <div className="text-2xl font-bold text-white">2.4h</div>
                  <div className="text-sm text-slate-400">Průměrná doba opravy</div>
                </div>
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
                  <div className="text-2xl font-bold text-white">45min</div>
                  <div className="text-sm text-slate-400">Reakce na P1</div>
                </div>
              </div>

              {/* Priority breakdown */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Dle priority</h3>
                <div className="space-y-3">
                  {[
                    { priority: 'P1', label: 'Havárie', count: 5, color: 'bg-red-500' },
                    { priority: 'P2', label: 'Tento týden', count: 12, color: 'bg-orange-500' },
                    { priority: 'P3', label: 'Plánované', count: 28, color: 'bg-blue-500' },
                    { priority: 'P4', label: 'Zlepšení', count: 8, color: 'bg-slate-400' },
                  ].map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-8 h-8 ${p.color} rounded-lg flex items-center justify-center text-white text-xs font-bold`}>
                        {p.priority}
                      </span>
                      <span className="flex-1 text-slate-300">{p.label}</span>
                      <span className="text-white font-medium">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'machines' && (
            <>
              {/* Machine health */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-500/20 backdrop-blur-xl rounded-2xl p-4 border border-emerald-500/30 text-center">
                  <div className="text-3xl font-bold text-emerald-400">12</div>
                  <div className="text-sm text-emerald-300">V provozu</div>
                </div>
                <div className="bg-amber-500/20 backdrop-blur-xl rounded-2xl p-4 border border-amber-500/30 text-center">
                  <div className="text-3xl font-bold text-amber-400">2</div>
                  <div className="text-sm text-amber-300">V servisu</div>
                </div>
                <div className="bg-red-500/20 backdrop-blur-xl rounded-2xl p-4 border border-red-500/30 text-center">
                  <div className="text-3xl font-bold text-red-400">1</div>
                  <div className="text-sm text-red-300">Porucha</div>
                </div>
              </div>

              {/* Downtime ranking */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Nejvíce prostojů</h3>
                <div className="space-y-3">
                  {MACHINE_DOWNTIME.map((machine, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                      <span className="w-8 h-8 bg-red-500/20 text-red-400 rounded-lg flex items-center justify-center font-bold">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium text-white">{machine.name}</div>
                        <div className="text-xs text-slate-400">{machine.incidents} incidentů</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-red-400">{machine.hours}h</div>
                        <div className="text-xs text-slate-400">prostoj</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* MTBF / MTTR */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <div className="text-sm text-slate-400 mb-1">MTBF</div>
                  <div className="text-2xl font-bold text-white">142h</div>
                  <div className="text-xs text-slate-500">Mean Time Between Failures</div>
                </div>
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <div className="text-sm text-slate-400 mb-1">MTTR</div>
                  <div className="text-2xl font-bold text-white">2.4h</div>
                  <div className="text-xs text-slate-500">Mean Time To Repair</div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'team' && (
            <>
              {/* Top performers */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">🏆 Nejlepší technici</h3>
                <div className="space-y-3">
                  {TOP_TECHNICIANS.map((tech, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: tech.color }}
                      >
                        {tech.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-white">{tech.name}</div>
                        <div className="text-xs text-slate-400">{tech.tasks} úkolů dokončeno</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-blue-400">{tech.avgTime}min</div>
                        <div className="text-xs text-slate-400">průměr/úkol</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Workload distribution */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Rozložení práce</h3>
                <div className="space-y-3">
                  {TOP_TECHNICIANS.map((tech, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-300">{tech.name}</span>
                        <span className="text-slate-400">{tech.tasks} úkolů</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full"
                          style={{ 
                            width: `${(tech.tasks / 30) * 100}%`,
                            backgroundColor: tech.color 
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
