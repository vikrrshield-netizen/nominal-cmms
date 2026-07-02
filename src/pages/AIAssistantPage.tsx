// src/pages/AIAssistantPage.tsx
// VIKRR — Asset Shield — Search & VIKRR AI

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useConfirm } from '../hooks/useConfirm';
import { useAuthContext } from '../context/AuthContext';
import { functions } from '../lib/firebase';
import appConfig from '../appConfig';
import VoiceMemoRecorder from '../components/ui/VoiceMemoRecorder';
import {
  Sparkles, Mic, MicOff, Send, ArrowLeft, Bot, User,
  AlertTriangle, Package, Calendar, FileText,
  Volume2, VolumeX, Loader2, Camera, SquarePen, Bell, ScanLine, ClipboardList,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;       // data URL pro zobrazení v bublině
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════
// CLAUDE AI INTEGRATION — přes bezpečný backend (Cloud Function assistantChat).
// API klíč žije na serveru, ne v prohlížeči. Asistent umí číst data systému
// (stav strojů, úkoly, termíny, Deník) a — podle role — i zapisovat.
// ═══════════════════════════════════════════════════════════════════

// Návrh akce (uložený na serveru) — klient potvrzuje jen přes id.
type PendingAction = { id: string; type: string; summary: string; danger?: boolean };
type AssistantReply = { reply: string; toolsUsed?: string[]; pendingActions?: PendingAction[] };

// Načte obrázek jako base64 (bez prefixu) + media type + data URL pro náhled.
function fileToImage(file: File): Promise<{ imageData: string; imageType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const imageData = dataUrl.split(',')[1] || '';
      resolve({ imageData, imageType: file.type || 'image/jpeg', dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function callAssistant(
  userMessage: string,
  history: Message[],
  image?: { imageData: string; imageType: string },
): Promise<{ reply: string; pendingActions: PendingAction[] }> {
  const callable = httpsCallable<
    { message: string; history: { role: string; content: string }[]; imageData?: string; imageType?: string },
    AssistantReply
  >(functions, 'assistantChat');

  const res = await callable({
    message: userMessage,
    history: history.map((m) => ({ role: m.role, content: m.content })),
    ...(image ? { imageData: image.imageData, imageType: image.imageType } : {}),
  });

  return {
    reply: res.data?.reply || 'Promiň, nepřišla žádná odpověď.',
    pendingActions: Array.isArray(res.data?.pendingActions) ? res.data.pendingActions : [],
  };
}

const QUICK_COMMANDS = [
  { label: 'Nahlásit poruchu', icon: AlertTriangle, color: 'bg-red-500', keyword: 'Chci nahlásit poruchu.' },
  { label: 'Stav skladu', icon: Package, color: 'bg-emerald-500', keyword: 'sklad' },
  { label: 'Revize', icon: Calendar, color: 'bg-amber-500', keyword: 'revize' },
  { label: 'Report', icon: FileText, color: 'bg-blue-500', keyword: 'report' },
];

// ── Lokální rozpoznání jednoduchých dotazů → odpověď z dat (bez volání Claude) ──
function localNorm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const SKLAD_STOP = new Set(['kolik', 'mame', 'mam', 'ma', 'je', 'jsou', 'na', 've', 'v', 'sklade', 'skladu', 'sklad', 'zbyva', 'zbyle', 'jeste', 'tam', 'tech', 'kusu', 'ks', 'stav', 'co', 'dochazi', 'chybi', 'nam', 'a', 'i', 'k', 'o', 'nejake', 'nejaky']);
function extractPart(words: string[]): string {
  return words.filter((w) => w.length > 1 && !SKLAD_STOP.has(w)).join(' ').trim();
}
// Vrátí { kind, query? } když jde o jednoduchý dotaz na data, jinak null (→ pošle se Claude).
function detectLocalIntent(raw: string): { kind: string; query?: string } | null {
  const t = localNorm(raw);
  if (!t) return null;
  // Zápis / akce / učení → VŽDY Claude (musí to rozumět a zapsat).
  if (/\b(zapis|zaloz|vytvor|pridej|nahlas|udel|proved|smaz|vymaz|oprav|zmen|nastav|pamatuj|zapamatuj|zapomen|napis|posli|uprav)\w*/.test(t)) return null;

  if (/\b(co (ted )?hori|co je noveho|co mam hlidat|situace|co se deje|co je dnes|shrnuti)/.test(t) || t === 'stav' || t === 'prehled') return { kind: 'overview' };
  if (/\b(co je (v )?poruse|jake jsou poruchy|co je rozbit|co nefunguje|poruchy stroju|rozbite stroje|v poruch)/.test(t)) return { kind: 'faults' };
  if (/\b(reviz|co propada|propadl|terminy reviz)/.test(t)) return { kind: 'revisions' };
  if (/\b(report|statistik|prehled provozu|mttr|nejporuchov|kolik ukolu)/.test(t)) return { kind: 'stats' };
  if (/\b(otevrene ukoly|co se resi|seznam ukolu|jake ukoly|ukoly co)/.test(t)) return { kind: 'tasks' };
  if (/\b(stav stroju|jak jsou na tom stroje|bezi vsechno|prehled stroju|stav zarizen)/.test(t)) return { kind: 'machines' };
  if (/\b(audit|ifs|brc|tesco|auditni pripravenost|pripraveni na audit)/.test(t)) return { kind: 'audit' };
  if (/\b(struktura|kartotek|budov|jake mistnost|kolik stroju|stroje v|extrudovn|michar|balirn|louparn|kotelna|expedic|dilna)/.test(t)) {
    // Celý dotaz pošli serveru — ten z něj vytáhne budovu / místnost (řeší i skloňování a plnící slova).
    return { kind: 'structure', query: t };
  }
  if (/\b(kdo delal|co se delalo|denik|zaznamy prace|kdo zapsal|historie prace)/.test(t)) {
    const q = t.replace(/\b(kdo|delal|delala|co|se|delalo|denik|zaznamy|prace|zapsal|historie|na|u)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return { kind: 'worklogs', query: q || undefined };
  }

  if (/\bsklad/.test(t)) {
    const q = extractPart(t.split(' '));
    return { kind: 'inventory', query: q || undefined };
  }
  if (/^(kolik|mame|je tam|zbyva)\b/.test(t)) {
    const q = extractPart(t.split(' '));
    if (q && q.length >= 3) return { kind: 'inventory', query: q };
  }
  const findM = t.match(/^(najdi|vyhledej|kde je|kde stoji|karta)\s+(.{2,})$/);
  if (findM) return { kind: 'find', query: findM[2].trim() };

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function AIAssistantPage() {
  const goBack = useBackNavigation('/');
  const { ask, notify } = useConfirm();
  const { user } = useAuthContext();
  
  const greeting = (): Message => ({
    id: '0',
    role: 'assistant',
    content: `Ahoj ${user?.displayName || 'uživateli'}! 👋 Jsem AI asistent pro ${appConfig.APP_NAME}. Můžu vám pomoct s hlášením poruch, kontrolou skladu, přehledem revizí a dalšími úkoly. Co potřebujete?`,
    timestamp: new Date(),
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = localStorage.getItem('ai-chat-v1');
      if (raw) {
        const arr = JSON.parse(raw) as Message[];
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
        }
      }
    } catch { /* ignore */ }
    return [greeting()];
  });
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState<boolean>(() => {
    try { return localStorage.getItem('ai-voice') === '1'; } catch { return false; }
  });

  // Foto pro AI
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoCaptionRef = useRef<string | undefined>(undefined);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const briefedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
   
  const recognitionRef = useRef<any>(null);

  // Číst odpověď nahlas (česky)
  const speak = useCallback((text: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'cs-CZ';
      u.onstart = () => setIsSpeaking(true);
      u.onend = () => setIsSpeaking(false);
      u.onerror = () => setIsSpeaking(false);
      synth.speak(u);
    } catch { /* ignore */ }
  }, []);

  // Rychlá odpověď Z DAT (bez Claude). Vrátí text, nebo null když se má radši zeptat Claude.
  const factsCallable = useMemo(
    () => httpsCallable<{ kind: string; query?: string }, { reply: string; count?: number }>(functions, 'assistantFacts'),
    [],
  );
  const tryFacts = useCallback(async (intent: { kind: string; query?: string }): Promise<string | null> => {
    try {
      const res = await factsCallable({ kind: intent.kind, query: intent.query });
      const reply = res.data?.reply?.trim();
      const count = res.data?.count;
      // U konkrétního hledání (sklad s dotazem / stroj): když 0 nálezů, radši Claude (mohli jsme špatně uhodnout slovo).
      if (((intent.kind === 'inventory' && intent.query) || intent.kind === 'find') && count === 0) return null;
      return reply || null;
    } catch (err) {
      console.error('[AI] assistantFacts error:', err);
      return null; // chyba → spadneme na Claude
    }
  }, [factsCallable]);

  // Potvrzení akce (Ano/Ne) → teprve po Ano se přes assistantConfirmAction opravdu zapíše.
  const confirmActionCallable = useMemo(
    () => httpsCallable<{ pendingId: string }, { reply: string }>(functions, 'assistantConfirmAction'),
    [],
  );
  const runPendingActions = useCallback(async (actions: PendingAction[]) => {
    for (const action of actions) {
      const okConfirm = await ask({
        title: 'Potvrdit akci',
        message: action.summary || 'Provést tuto akci?',
        confirmText: 'Ano, provést',
        cancelText: 'Ne',
        danger: !!action.danger,
      });
      if (!okConfirm) {
        setMessages((prev) => [...prev, { id: `skip-${Date.now()}`, role: 'assistant', content: 'Dobře, nic jsem neprovedl. 👍', timestamp: new Date() }]);
        continue;
      }
      setIsProcessing(true);
      let reply = '✅ Hotovo.';
      try {
        const res = await confirmActionCallable({ pendingId: action.id });
        reply = res.data?.reply || reply;
      } catch (err) {
        console.error('[AI] assistantConfirmAction error:', err);
        reply = 'Akci se nepodařilo provést. Zkus to prosím znovu.';
      }
      setMessages((prev) => [...prev, { id: `done-${Date.now()}`, role: 'assistant', content: reply, timestamp: new Date() }]);
      setIsProcessing(false);
      if (voiceOn) speak(reply);
    }
  }, [ask, confirmActionCallable, voiceOn, speak]);

  // handleSend — must be declared before useEffect that uses it
  const handleSend = useCallback(async (messageText?: string, image?: { imageData: string; imageType: string; dataUrl: string }) => {
    const text = (messageText ?? input).trim();
    if (!text && !image) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || (image ? '📷 Foto' : ''),
      image: image?.dataUrl,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    let response: string | null = null;
    let pendingActions: PendingAction[] = [];

    // 1) Zkus odpovědět Z DAT (bez Claude), když jde o jednoduchý dotaz a není to foto.
    const intent = image ? null : detectLocalIntent(text);
    if (intent) {
      response = await tryFacts(intent);
    }

    // 2) Jinak (nebo když data nestačila) → Claude.
    if (response === null) {
      try {
        const r = await callAssistant(
          text || 'Popiš, co je na fotce, a poraď nebo zapiš, co je potřeba.',
          messages,
          image ? { imageData: image.imageData, imageType: image.imageType } : undefined,
        );
        response = r.reply;
        pendingActions = r.pendingActions;
      } catch (err) {
        console.error('[AI] assistantChat error:', err);
        const e = err as { message?: string };
        response = e?.message || 'AI asistent je teď nedostupný. Zkus to prosím za chvíli.';
      }
    }

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);
    setIsProcessing(false);
    if (voiceOn) speak(response);

    // 3) Když AI připravila návrh(y) zápisu → ukaž Ano/Ne a po potvrzení proveď.
    if (pendingActions.length) {
      await runPendingActions(pendingActions);
    }
  }, [input, messages, voiceOn, speak, tryFacts, runPendingActions]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Uložit konverzaci — přežije odchod ze stránky i refresh (fotky se neukládají kvůli velikosti)
  useEffect(() => {
    try {
      const slim = messages.slice(-40).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: (m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp)).toISOString(),
      }));
      localStorage.setItem('ai-chat-v1', JSON.stringify(slim));
    } catch { /* quota / ignore */ }
  }, [messages]);

  const newChat = async () => {
    if (!(await ask({ message: 'Začít novou konverzaci? Tahle se smaže.', danger: true }))) return;
    try { localStorage.removeItem('ai-chat-v1'); } catch { /* ignore */ }
    briefedRef.current = false;
    setMessages([greeting()]);
  };

  // Proaktivní hlášení — AI sama řekne, co teď hoří (poruchy, propadlé termíny). Bez ptaní.
  const briefingCallable = useMemo(
    () => httpsCallable<Record<string, never>, { reply: string; hasAlerts?: boolean }>(functions, 'assistantBriefing'),
    [],
  );
  const runBriefing = useCallback(async (manual: boolean) => {
    setIsProcessing(true);
    try {
      const res = await briefingCallable({});
      const reply = res.data?.reply?.trim();
      if (reply) {
        setMessages((prev) => [...prev, { id: `brief-${Date.now()}`, role: 'assistant', content: reply, timestamp: new Date() }]);
      } else if (manual) {
        notify('Aktuální stav se teď nepodařilo načíst.');
      }
    } catch (err) {
      console.error('[AI] assistantBriefing error:', err);
      if (manual) notify('Aktuální stav se teď nepodařilo načíst. Zkus to prosím za chvíli.');
    } finally {
      setIsProcessing(false);
    }
  }, [briefingCallable, notify]);

  // Při otevření čerstvé konverzace ať AI rovnou hlásí, co hoří (jednou).
  useEffect(() => {
    if (briefedRef.current) return;
    briefedRef.current = true;
    if (messages.length === 1 && messages[0].id === '0') {
      void runBriefing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize speech recognition
  useEffect(() => {
     
    const W = window as any;
    const SpeechRecognitionClass = W.webkitSpeechRecognition || W.SpeechRecognition;
    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'cs-CZ';

       
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSend(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [handleSend]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      notify('Hlasové ovládání není podporováno ve vašem prohlížeči');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Otevře fotoaparát s konkrétním záměrem (popsat závadu / úkol z fotky / štítek stroje).
  const choosePhoto = (caption?: string) => {
    setPhotoMenuOpen(false);
    photoCaptionRef.current = caption;
    photoInputRef.current?.click();
  };

  // Foto → AI (Claude obrázek přečte a podle záměru popíše / navrhne úkol / najde stroj)
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    const caption = photoCaptionRef.current;
    photoCaptionRef.current = undefined;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { notify('Obrázek je moc velký (max 5 MB). Zkus menší / horší kvalitu.'); return; }
    try {
      const img = await fileToImage(file);
      handleSend(caption ?? (input.trim() || undefined), img);
    } catch {
      notify('Foto se nepodařilo načíst.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f1ece3] flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-emerald-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-emerald-700/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-4 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => goBack()}
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{appConfig.PRODUCT_NAME} AI</h1>
              <p className="text-xs text-slate-400">
                {isListening ? '🎤 Poslouchám...' : isProcessing ? '🤔 Přemýšlím...' : '✨ Připraven'}
              </p>
            </div>
          </div>

          <button
            onClick={() => runBriefing(true)}
            title="Aktuální stav — co teď hoří (poruchy, propadlé termíny)"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 transition"
          >
            <Bell className="w-5 h-5" />
          </button>

          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} className="hidden" />
          <div className="relative">
            <button
              onClick={() => setPhotoMenuOpen((o) => !o)}
              title="Vyfotit — popsat závadu, založit úkol nebo načíst štítek stroje"
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 transition"
            >
              <Camera className="w-5 h-5" />
            </button>
            {photoMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setPhotoMenuOpen(false)} />
                <div className="absolute right-0 mt-2 z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  <button onClick={() => choosePhoto(undefined)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50">
                    <Camera className="w-4 h-4 text-slate-500" /> Popsat závadu / poradit
                  </button>
                  <button onClick={() => choosePhoto('Z téhle fotky závady navrhni úkol na opravu — najdi stroj v Kartotéce a urči prioritu.')} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100">
                    <ClipboardList className="w-4 h-4 text-slate-500" /> Založit úkol z fotky
                  </button>
                  <button onClick={() => choosePhoto('Načti výrobní štítek stroje a najdi ho v Kartotéce — když tam není, nabídni založení.')} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100">
                    <ScanLine className="w-4 h-4 text-slate-500" /> Načíst štítek stroje
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => {
              const next = !voiceOn;
              setVoiceOn(next);
              try { localStorage.setItem('ai-voice', next ? '1' : '0'); } catch { /* ignore */ }
              if (!next) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } setIsSpeaking(false); }
            }}
            title={voiceOn ? 'Hlas zapnutý — čte odpovědi nahlas' : 'Hlas vypnutý'}
            className={`p-2 rounded-xl border transition ${voiceOn ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500'}`}
          >
            {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            onClick={newChat}
            title="Nová konverzace (smaže tuhle)"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 transition"
          >
            <SquarePen className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              message.role === 'user' 
                ? 'bg-blue-500' 
                : 'bg-emerald-600'
            }`}>
              {message.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
            </div>
            
            <div className={`max-w-[80%] p-4 rounded-2xl ${
              message.role === 'user' 
                ? 'bg-blue-500 text-white'
                : 'bg-white border border-slate-200 text-slate-900'
            }`}>
              {message.image && (
                <img src={message.image} alt="foto" className="mb-2 max-h-48 w-auto rounded-lg border border-black/10" />
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>

              <p className="text-xs opacity-60 mt-2">
                {message.timestamp.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Commands */}
      {messages.length < 3 && (
        <div className="relative z-10 px-4 pb-2">
          <p className="text-xs text-slate-500 mb-2">Rychlé příkazy:</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {QUICK_COMMANDS.map((cmd, i) => (
              <button
                key={i}
                onClick={() => handleSend(cmd.keyword)}
                className={`${cmd.color} text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap`}
              >
                <cmd.icon className="w-4 h-4" />
                {cmd.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Voice Memo */}
      <div className="relative z-10 px-4 pt-2">
        <VoiceMemoRecorder
          userId={user?.uid || 'anon'}
          label="Hlasová zpráva pro AI"
          onUpload={(url) => handleSend(`[Hlasová zpráva: ${url}]`)}
        />
      </div>

      {/* Input */}
      <div className="relative z-10 p-4 border-t border-slate-200">
        <div className="flex gap-2">
          <button
            onClick={toggleListening}
            className={`p-4 rounded-2xl transition ${
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isListening ? 'Poslouchám...' : 'Napište nebo řekněte příkaz...'}
            className="flex-1 p-4 bg-[#fbf9f4] border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
            disabled={isListening}
          />

          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isProcessing}
            className="p-4 bg-emerald-600 text-white rounded-2xl disabled:opacity-50 hover:shadow-lg transition"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>

        <p className="text-xs text-slate-500 text-center mt-2">
          ✨ Powered by Claude
        </p>
      </div>
    </div>
  );
}
