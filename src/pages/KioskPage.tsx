// src/pages/KioskPage.tsx
// VIKRR — Asset Shield — Kiosk mód pro tablet (s Firestore zápisem)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { createTask } from '../services/taskService';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AlertTriangle, Package, Lightbulb, ShieldCheck, Send,
  LogOut, CheckCircle2, ArrowLeft, Filter, HelpCircle,
  ChevronRight, X, Loader2, ClipboardList
} from 'lucide-react';

type ViewState = 'MENU' | 'BREAKDOWN' | 'ORDER' | 'IDEA' | 'MESSAGE' | 'PREFILTER' | 'ASSISTANT' | 'HANDOVER';

interface QuickOption {
  id: string;
  label: string;
  icon?: string;
}

const QUICK_BREAKDOWNS: QuickOption[] = [
  { id: 'stuck', label: 'Zaseknutý materiál', icon: '🔴' },
  { id: 'noise', label: 'Hluk / vibrace', icon: '🔊' },
  { id: 'leak', label: 'Únik oleje / kapaliny', icon: '💧' },
  { id: 'temp', label: 'Přehřívání', icon: '🌡️' },
  { id: 'electric', label: 'Elektrická závada', icon: '⚡' },
  { id: 'sensor', label: 'Chyba čidla', icon: '📡' },
  { id: 'belt', label: 'Poškozený pás / řemen', icon: '🔗' },
  { id: 'other', label: 'Jiné...', icon: '✏️' },
];

const QUICK_PARTS: QuickOption[] = [
  { id: 'brush', label: 'Kartáč', icon: '🧹' },
  { id: 'ejector', label: 'Vyražeč', icon: '🔨' },
  { id: 'blade', label: 'Nůž / čepel', icon: '🔪' },
  { id: 'bearing', label: 'Ložisko', icon: '⚙️' },
  { id: 'belt', label: 'Řemen', icon: '🔗' },
  { id: 'filter', label: 'Filtr', icon: '🌀' },
  { id: 'gloves', label: 'Rukavice', icon: '🧤' },
  { id: 'tape', label: 'Páska / lepidlo', icon: '📦' },
  { id: 'lubricant', label: 'Mazivo', icon: '🛢️' },
  { id: 'tool', label: 'Nářadí', icon: '🔧' },
  { id: 'other', label: 'Jiné...', icon: '✏️' },
];

const MACHINES_PREFILTER = [
  { id: 'ext1', label: 'Extruder 1', icon: '🔵' },
  { id: 'ext2', label: 'Extruder 2', icon: '🟢' },
  { id: 'mix1', label: 'Míchárna 1', icon: '🟠' },
  { id: 'mix2', label: 'Míchárna 2', icon: '🟡' },
];

const MACHINES_ALL = [
  { id: 'ext1', label: 'Extruder 1' },
  { id: 'ext2', label: 'Extruder 2' },
  { id: 'mix1', label: 'Míchárna 1' },
  { id: 'mix2', label: 'Míchárna 2' },
  { id: 'mix3', label: 'Míchárna 3' },
  { id: 'pack1', label: 'Balička Karel' },
  { id: 'pack2', label: 'Balička Lojza' },
  { id: 'pack3', label: 'Balička U Agáty' },
  { id: 'mill', label: 'Mlýn' },
  { id: 'comp', label: 'Kompresor' },
  { id: 'other', label: 'Jiný stroj...' },
];

const ASSISTANT_TIPS = [
  { title: '🔴 P1 — Havárie (okamžitě)', steps: ['1. STOP stroj (červené tlačítko)', '2. Nahlásit přes Kiosk → Porucha', '3. Zavolat údržbu: Vilém 777 123 456', '4. Počkat u stroje, nikoho nepouštět'] },
  { title: '🟠 P2 — Vážná závada (dnes)', steps: ['1. Pokud možno dokončit sérii', '2. Nahlásit přes Kiosk → Porucha', '3. Označit stroj cedulkou', '4. Pokračovat na jiném stroji'] },
  { title: '🟡 P3 — Běžná údržba', steps: ['1. Nahlásit přes Kiosk', '2. Bude naplánováno na pondělí', '3. Pokračovat v práci normálně'] },
  { title: '🟢 P4 — Nápad / zlepšení', steps: ['1. Zapsat přes Kiosk → Nápad', '2. Bude projednáno na poradě'] },
];

export default function KioskPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  const [activeView, setActiveView] = useState<ViewState>('MENU');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Odesláno!');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [selectedQuickOption, setSelectedQuickOption] = useState('');
  const [customText, setCustomText] = useState('');
  const [prefilterDate, setPrefilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [shiftNotes, setShiftNotes] = useState<{ id: string; author: string; text: string; time: string; priority: string }[]>([]);
  const [handoverText, setHandoverText] = useState('');
  const [handoverPriority, setHandoverPriority] = useState<'normal' | 'important'>('normal');

  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);

  // Shift handover notes listener
  useEffect(() => {
    const q2 = query(collection(db, 'shiftNotes'), orderBy('createdAt', 'desc'), limit(20));
    const unsub = onSnapshot(q2, (snap) => {
      setShiftNotes(snap.docs.map(d => {
        const data = d.data();
        const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
        return {
          id: d.id,
          author: data.author || 'Neznámý',
          text: data.text || '',
          time: ts.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }),
          priority: data.priority || 'normal',
        };
      }));
    }, () => setShiftNotes([]));
    return () => unsub();
  }, []);

  const resetForm = () => { setSelectedMachine(''); setSelectedQuickOption(''); setCustomText(''); setPrefilterDate(new Date().toISOString().split('T')[0]); setSubmitError(''); };

  const showSuccessAndReset = (msg: string) => { setSuccessMessage(msg); setShowSuccess(true); resetForm(); setActiveView('MENU'); setIsSubmitting(false); setTimeout(() => setShowSuccess(false), 4000); };

  const handleBreakdownSubmit = async (machineName: string, problem: string) => {
    if (isSubmitting) return; setIsSubmitting(true); setSubmitError('');
    try {
      await createTask({ title: machineName + ': ' + problem, description: 'Nahlášeno z kiosku. Stroj: ' + machineName + ', Problém: ' + problem, type: 'corrective', priority: 'P1', source: 'kiosk', assetName: machineName, buildingId: 'D', createdById: user?.id || 'kiosk', createdByName: user?.displayName || 'Kiosk Velín' });
      showSuccessAndReset('Porucha nahlášena!');
    } catch (err) { console.error('Kiosk breakdown error:', err); setSubmitError('Chyba při odesílání. Zkuste znovu.'); setIsSubmitting(false); }
  };

  const handleOrderSubmit = async (partName: string) => {
    if (isSubmitting) return; setIsSubmitting(true); setSubmitError('');
    try {
      await createTask({ title: 'Objednávka dílu: ' + partName, description: 'Požadavek z kiosku: ' + partName, type: 'corrective', priority: 'P3', source: 'kiosk', createdById: user?.id || 'kiosk', createdByName: user?.displayName || 'Kiosk Velín' });
      showSuccessAndReset('Objednávka odeslána!');
    } catch (err) { console.error('Kiosk order error:', err); setSubmitError('Chyba. Zkuste znovu.'); setIsSubmitting(false); }
  };

  const handlePrefilterSubmit = async (machineName: string, date: string) => {
    if (isSubmitting) return; setIsSubmitting(true); setSubmitError('');
    try {
      await addDoc(collection(db, 'prefilters'), { assetName: machineName, changedAt: new Date(date), changedById: user?.id || 'kiosk', changedByName: user?.displayName || 'Kiosk Velín', notes: 'Výměna předfiltru z kiosku', createdAt: serverTimestamp() });
      showSuccessAndReset('Výměna zaznamenána!');
    } catch (err) { console.error('Kiosk prefilter error:', err); setSubmitError('Chyba. Zkuste znovu.'); setIsSubmitting(false); }
  };

  const handleIdeaSubmit = async (idea: string) => {
    if (isSubmitting) return; setIsSubmitting(true); setSubmitError('');
    try {
      await createTask({ title: 'Nápad: ' + idea.substring(0, 60) + (idea.length > 60 ? '...' : ''), description: idea, type: 'improvement', priority: 'P4', source: 'kiosk', createdById: user?.id || 'kiosk', createdByName: user?.displayName || 'Kiosk Velín' });
      showSuccessAndReset('Nápad odeslán!');
    } catch (err) { console.error('Kiosk idea error:', err); setSubmitError('Chyba. Zkuste znovu.'); setIsSubmitting(false); }
  };

  const handleMessageSubmit = async (message: string) => {
    if (isSubmitting) return; setIsSubmitting(true); setSubmitError('');
    try {
      await addDoc(collection(db, 'trustbox'), { message, category: 'other', status: 'new', createdAt: serverTimestamp() });
      showSuccessAndReset('Zpráva odeslána anonymně!');
    } catch (err) { console.error('Kiosk trustbox error:', err); setSubmitError('Chyba. Zkuste znovu.'); setIsSubmitting(false); }
  };

  const handleHandoverSubmit = async () => {
    if (isSubmitting || !handoverText.trim()) return;
    setIsSubmitting(true); setSubmitError('');
    try {
      await addDoc(collection(db, 'shiftNotes'), {
        text: handoverText.trim(),
        author: user?.displayName || 'Kiosk',
        priority: handoverPriority,
        createdAt: serverTimestamp(),
      });
      setHandoverText('');
      setHandoverPriority('normal');
      showSuccessAndReset('Poznámka přidána!');
    } catch (err) {
      console.error('Handover error:', err);
      setSubmitError('Chyba. Zkuste znovu.');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => { resetForm(); setHandoverText(''); setHandoverPriority('normal'); setActiveView('MENU'); };
  const handleLogout = async () => { await logout(); navigate('/'); };

  const renderClock = () => (<div className="absolute top-6 left-1/2 -translate-x-1/2 text-center"><div className="text-5xl md:text-7xl font-mono font-bold text-white tracking-wider">{currentTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</div><div className="text-lg md:text-xl text-slate-400 mt-1">{currentTime.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>);
  const renderSuccess = () => (<div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 animate-bounce"><div className="bg-emerald-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3"><CheckCircle2 className="w-8 h-8" /><span className="text-xl md:text-2xl font-bold">{successMessage}</span></div></div>);
  const renderError = () => submitError ? (<div className="bg-red-900/50 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl mb-4 text-center text-lg">{submitError}</div>) : null;
  const renderSubmitting = () => isSubmitting ? (<div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"><div className="bg-slate-800 px-8 py-6 rounded-2xl flex items-center gap-4"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /><span className="text-xl text-white">Odesílám...</span></div></div>) : null;

  const renderMenu = () => (<div className="w-full max-w-6xl">{renderClock()}<div className="mt-32 md:mt-40"><h1 className="text-2xl md:text-3xl font-bold text-slate-400 text-center mb-6 md:mb-8">Co potřebujete?</h1><div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-6"><MenuButton icon={<AlertTriangle className="w-12 h-12 md:w-16 md:h-16" />} label="Nahlásit poruchu" color="bg-red-600 hover:bg-red-500" onClick={() => setActiveView('BREAKDOWN')} /><MenuButton icon={<Package className="w-12 h-12 md:w-16 md:h-16" />} label="Objednat díl" color="bg-blue-600 hover:bg-blue-500" onClick={() => setActiveView('ORDER')} /><MenuButton icon={<Filter className="w-12 h-12 md:w-16 md:h-16" />} label="Výměna předfiltru" color="bg-cyan-600 hover:bg-cyan-500" onClick={() => setActiveView('PREFILTER')} /><MenuButton icon={<Lightbulb className="w-12 h-12 md:w-16 md:h-16" />} label="Nápad na zlepšení" color="bg-emerald-600 hover:bg-emerald-500" onClick={() => setActiveView('IDEA')} /><MenuButton icon={<ShieldCheck className="w-12 h-12 md:w-16 md:h-16" />} label="Schránka důvěry" color="bg-purple-600 hover:bg-purple-500" onClick={() => setActiveView('MESSAGE')} /><MenuButton icon={<HelpCircle className="w-12 h-12 md:w-16 md:h-16" />} label="Jak postupovat?" color="bg-amber-600 hover:bg-amber-500" onClick={() => setActiveView('ASSISTANT')} /><MenuButton icon={<ClipboardList className="w-12 h-12 md:w-16 md:h-16" />} label="Předání směny" color="bg-indigo-600 hover:bg-indigo-500" onClick={() => setActiveView('HANDOVER')} /></div></div><button onClick={handleLogout} className="absolute bottom-6 left-1/2 -translate-x-1/2 text-slate-600 hover:text-white flex items-center gap-2 text-lg transition"><LogOut className="w-5 h-5" /><span>Odhlásit terminál</span></button></div>);

  const renderBreakdown = () => (<FormWrapper title="🔴 Nahlásit poruchu" onCancel={handleCancel}>{renderError()}{!selectedMachine && (<div><h3 className="text-xl text-slate-300 mb-4">1. Na kterém stroji?</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{MACHINES_ALL.map(m => (<QuickButton key={m.id} label={m.label} selected={selectedMachine === m.id} onClick={() => setSelectedMachine(m.id)} />))}</div></div>)}{selectedMachine && !selectedQuickOption && (<div><div className="flex items-center gap-2 mb-4"><span className="text-emerald-400">✓</span><span className="text-slate-400">{MACHINES_ALL.find(m => m.id === selectedMachine)?.label}</span><button onClick={() => setSelectedMachine('')} className="text-slate-500 hover:text-white ml-2"><X className="w-4 h-4" /></button></div><h3 className="text-xl text-slate-300 mb-4">2. Jaký problém?</h3><div className="grid grid-cols-2 gap-3">{QUICK_BREAKDOWNS.map(o => (<QuickButton key={o.id} label={o.icon + ' ' + o.label} selected={selectedQuickOption === o.id} onClick={() => { setSelectedQuickOption(o.id); if (o.id !== 'other') { handleBreakdownSubmit(MACHINES_ALL.find(m => m.id === selectedMachine)?.label || selectedMachine, o.label); }}} />))}</div></div>)}{selectedMachine && selectedQuickOption === 'other' && (<div><h3 className="text-xl text-slate-300 mb-4">3. Popište problém:</h3><textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Co se děje?" autoFocus className="w-full h-40 bg-slate-700 text-white text-xl p-4 rounded-2xl border-2 border-slate-600 focus:border-red-500 outline-none resize-none mb-4" /><button onClick={() => handleBreakdownSubmit(MACHINES_ALL.find(m => m.id === selectedMachine)?.label || selectedMachine, customText)} disabled={!customText.trim() || isSubmitting} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-4 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"><Send className="w-6 h-6" />Odeslat hlášení</button></div>)}</FormWrapper>);

  const renderOrder = () => (<FormWrapper title="📦 Objednat díl" onCancel={handleCancel}>{renderError()}{!selectedQuickOption && (<div><h3 className="text-xl text-slate-300 mb-4">Co potřebujete?</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{QUICK_PARTS.map(o => (<QuickButton key={o.id} label={o.icon + ' ' + o.label} selected={selectedQuickOption === o.id} onClick={() => { setSelectedQuickOption(o.id); if (o.id !== 'other') handleOrderSubmit(o.label); }} />))}</div></div>)}{selectedQuickOption === 'other' && (<div><h3 className="text-xl text-slate-300 mb-4">Upřesněte:</h3><textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Jaký díl potřebujete?" autoFocus className="w-full h-40 bg-slate-700 text-white text-xl p-4 rounded-2xl border-2 border-slate-600 focus:border-blue-500 outline-none resize-none mb-4" /><button onClick={() => handleOrderSubmit(customText)} disabled={!customText.trim() || isSubmitting} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-4 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"><Send className="w-6 h-6" />Odeslat objednávku</button></div>)}</FormWrapper>);

  const renderPrefilter = () => (<FormWrapper title="🌀 Výměna předfiltru" onCancel={handleCancel}>{renderError()}{!selectedMachine && (<div><h3 className="text-xl text-slate-300 mb-4">Na kterém stroji?</h3><div className="grid grid-cols-2 gap-4">{MACHINES_PREFILTER.map(m => (<button key={m.id} onClick={() => setSelectedMachine(m.id)} className="bg-slate-700 hover:bg-slate-600 text-white p-6 rounded-2xl text-center transition active:scale-95"><span className="text-4xl block mb-2">{m.icon}</span><span className="text-xl font-bold">{m.label}</span></button>))}</div></div>)}{selectedMachine && (<div><div className="bg-slate-700 rounded-2xl p-6 mb-6"><div className="flex items-center justify-between mb-4"><span className="text-slate-400">Stroj:</span><span className="text-white text-xl font-bold">{MACHINES_PREFILTER.find(m => m.id === selectedMachine)?.icon} {MACHINES_PREFILTER.find(m => m.id === selectedMachine)?.label}</span></div><div className="flex items-center justify-between"><span className="text-slate-400">Datum výměny:</span><input type="date" value={prefilterDate} onChange={e => setPrefilterDate(e.target.value)} className="bg-slate-600 text-white text-xl p-2 rounded-lg border border-slate-500" /></div></div><button onClick={() => handlePrefilterSubmit(MACHINES_PREFILTER.find(m => m.id === selectedMachine)?.label || selectedMachine, prefilterDate)} disabled={isSubmitting} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"><CheckCircle2 className="w-6 h-6" />Potvrdit výměnu</button></div>)}</FormWrapper>);

  const renderIdea = () => (<FormWrapper title="💡 Nápad na zlepšení" onCancel={handleCancel}>{renderError()}<textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Váš nápad..." autoFocus className="w-full h-48 bg-slate-700 text-white text-xl p-4 rounded-2xl border-2 border-slate-600 focus:border-emerald-500 outline-none resize-none mb-4" /><button onClick={() => handleIdeaSubmit(customText)} disabled={!customText.trim() || isSubmitting} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-4 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"><Send className="w-6 h-6" />Odeslat nápad</button></FormWrapper>);

  const renderMessage = () => (<FormWrapper title="🔒 Schránka důvěry" onCancel={handleCancel}>{renderError()}<p className="text-slate-400 text-center mb-4">100% anonymní zpráva vedení</p><textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Vaše zpráva..." autoFocus className="w-full h-48 bg-slate-700 text-white text-xl p-4 rounded-2xl border-2 border-slate-600 focus:border-purple-500 outline-none resize-none mb-4" /><button onClick={() => handleMessageSubmit(customText)} disabled={!customText.trim() || isSubmitting} className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-4 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"><ShieldCheck className="w-6 h-6" />Odeslat anonymně</button></FormWrapper>);

  const renderAssistant = () => (<FormWrapper title="🤖 Jak postupovat při poruše?" onCancel={handleCancel}><div className="space-y-4 overflow-y-auto max-h-[60vh]">{ASSISTANT_TIPS.map((tip, i) => (<div key={i} className="bg-slate-700 rounded-2xl p-4"><h3 className="text-xl font-bold text-white mb-3">{tip.title}</h3><ul className="space-y-2">{tip.steps.map((step, j) => (<li key={j} className="text-lg text-slate-300 flex items-start gap-2"><ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />{step}</li>))}</ul></div>))}<div className="bg-amber-900/50 border border-amber-500/30 rounded-2xl p-4 mt-4"><h3 className="text-lg font-bold text-amber-400 mb-2">📞 Kontakty údržby:</h3><p className="text-white text-lg">Vilém: <span className="font-mono">777 123 456</span></p><p className="text-white text-lg">Zdeněk: <span className="font-mono">777 654 321</span></p></div></div></FormWrapper>);

  const renderHandover = () => (
    <FormWrapper title="📋 Předání směny — Nástěnka" onCancel={handleCancel}>
      {renderError()}
      <div className="space-y-3 mb-4 max-h-[40vh] overflow-y-auto">
        {shiftNotes.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-lg">Zatím žádné poznámky</div>
        ) : (
          shiftNotes.map((note) => (
            <div key={note.id} className={`rounded-xl p-4 border ${note.priority === 'important' ? 'bg-red-900/30 border-red-500/30' : 'bg-slate-700 border-slate-600'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-white">{note.author}</span>
                <span className="text-xs text-slate-500">{note.time}</span>
              </div>
              <p className="text-lg text-slate-300">{note.text}</p>
              {note.priority === 'important' && <span className="inline-block mt-1 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">DŮLEŽITÉ</span>}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-slate-600 pt-4">
        <div className="flex gap-2 mb-3">
          <button onClick={() => setHandoverPriority('normal')} className={`flex-1 py-2 rounded-xl text-lg font-medium transition ${handoverPriority === 'normal' ? 'bg-slate-600 text-white' : 'bg-slate-700/50 text-slate-500'}`}>Běžná</button>
          <button onClick={() => setHandoverPriority('important')} className={`flex-1 py-2 rounded-xl text-lg font-medium transition ${handoverPriority === 'important' ? 'bg-red-600 text-white' : 'bg-slate-700/50 text-slate-500'}`}>Důležitá</button>
        </div>
        <textarea value={handoverText} onChange={e => setHandoverText(e.target.value)} placeholder="Zpráva pro další směnu..." className="w-full h-32 bg-slate-700 text-white text-xl p-4 rounded-2xl border-2 border-slate-600 focus:border-indigo-500 outline-none resize-none mb-3" />
        <button onClick={handleHandoverSubmit} disabled={!handoverText.trim() || isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-4 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"><Send className="w-6 h-6" />Přidat poznámku</button>
      </div>
    </FormWrapper>
  );

  return (<div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 md:p-6 relative">{renderSubmitting()}{showSuccess && renderSuccess()}{activeView === 'MENU' && renderMenu()}{activeView === 'BREAKDOWN' && renderBreakdown()}{activeView === 'ORDER' && renderOrder()}{activeView === 'PREFILTER' && renderPrefilter()}{activeView === 'IDEA' && renderIdea()}{activeView === 'MESSAGE' && renderMessage()}{activeView === 'ASSISTANT' && renderAssistant()}{activeView === 'HANDOVER' && renderHandover()}</div>);
}

function MenuButton({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick: () => void }) {
  return (<button onClick={onClick} className={`${color} text-white rounded-2xl md:rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center transition-all shadow-2xl active:scale-95 min-h-[140px] md:min-h-[180px]`}>{icon}<span className="text-base md:text-xl font-bold text-center mt-3 leading-tight">{label}</span></button>);
}

function QuickButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (<button onClick={onClick} className={`p-4 md:p-5 rounded-xl text-lg md:text-xl font-medium transition active:scale-95 ${selected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>{label}</button>);
}

function FormWrapper({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (<div className="w-full max-w-4xl bg-slate-800 p-6 md:p-8 rounded-3xl shadow-2xl"><div className="flex items-center gap-4 mb-6"><button onClick={onCancel} className="p-3 rounded-xl bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition"><ArrowLeft className="w-6 h-6" /></button><h2 className="text-2xl md:text-3xl font-bold text-white">{title}</h2></div>{children}</div>);
}
