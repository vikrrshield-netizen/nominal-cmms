// src/components/kiosk/KioskAssistant.tsx
// VIKRR — Asset Shield — AI pomocník v kiosku pro operátory.
// Operátor řekne / napíše / vyfotí, co se děje u stroje; AI poradí a přes potvrzení (Ano/Ne)
// nahlásí poruchu / zapíše práci. Zápis se podepíše pod přihlášeného uživatele kiosku
// (backend assistantChat + assistantConfirmAction, stejné jako na stránce /ai).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Bot, User, Send, Mic, MicOff, Camera, Loader2 } from 'lucide-react';
import { functions } from '../../lib/firebase';
import { useConfirm } from '../../hooks/useConfirm';

interface Msg { id: string; role: 'user' | 'assistant'; content: string; image?: string }
type PendingAction = { id: string; type: string; summary: string; danger?: boolean };
type ChatReply = { reply: string; pendingActions?: PendingAction[] };

function fileToImage(file: File): Promise<{ imageData: string; imageType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve({ imageData: dataUrl.split(',')[1] || '', imageType: file.type || 'image/jpeg', dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const GREETING = 'Ahoj! Napiš nebo řekni, co se děje u stroje — třeba „extruder 2 dělá divný zvuk". Můžeš i vyfotit. Pomůžu ti to nahlásit.';

export default function KioskAssistant() {
  const { ask, notify } = useConfirm();
  const [messages, setMessages] = useState<Msg[]>([{ id: '0', role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const chatCallable = useMemo(
    () => httpsCallable<{ message: string; history: { role: string; content: string }[]; imageData?: string; imageType?: string }, ChatReply>(functions, 'assistantChat'),
    [],
  );
  const confirmCallable = useMemo(
    () => httpsCallable<{ pendingId: string }, { reply: string }>(functions, 'assistantConfirmAction'),
    [],
  );

  const addMsg = useCallback((m: Omit<Msg, 'id'>) => {
    seq.current += 1;
    setMessages((prev) => [...prev, { id: `k${Date.now()}-${seq.current}`, ...m }]);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const runPending = useCallback(async (actions: PendingAction[]) => {
    for (const action of actions) {
      const ok = await ask({ title: 'Potvrdit', message: action.summary || 'Provést tuto akci?', confirmText: 'Ano, provést', cancelText: 'Ne', danger: !!action.danger });
      if (!ok) { addMsg({ role: 'assistant', content: 'Dobře, nic jsem neprovedl. 👍' }); continue; }
      setBusy(true);
      let reply = '✅ Hotovo.';
      try { const res = await confirmCallable({ pendingId: action.id }); reply = res.data?.reply || reply; }
      catch (err) { console.error('[Kiosk AI] confirm error:', err); reply = 'Nepovedlo se to zapsat, zkus to prosím znovu.'; }
      addMsg({ role: 'assistant', content: reply });
      setBusy(false);
    }
  }, [ask, confirmCallable, addMsg]);

  const send = useCallback(async (textArg?: string, image?: { imageData: string; imageType: string; dataUrl: string }) => {
    const text = (textArg ?? input).trim();
    if (!text && !image) return;
    // Přečti aktuální historii bez „stavového" hooku uvnitř callbacku.
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    addMsg({ role: 'user', content: text || '📷 Foto', image: image?.dataUrl });
    setInput('');
    setBusy(true);
    let reply = '';
    let pending: PendingAction[] = [];
    try {
      const res = await chatCallable({
        message: text || 'Popiš, co je na fotce u stroje, a poraď nebo nahlas, co je potřeba.',
        history,
        ...(image ? { imageData: image.imageData, imageType: image.imageType } : {}),
      });
      reply = res.data?.reply || 'Promiň, nepřišla odpověď.';
      pending = Array.isArray(res.data?.pendingActions) ? res.data.pendingActions : [];
    } catch (err) {
      console.error('[Kiosk AI] chat error:', err);
      const e = err as { message?: string };
      reply = e?.message || 'AI je teď nedostupná. Zkus to prosím za chvíli, nebo použij „Nahlásit poruchu".';
    }
    addMsg({ role: 'assistant', content: reply });
    setBusy(false);
    if (pending.length) await runPending(pending);
  }, [input, messages, chatCallable, addMsg, runPending]);

  // Hlasový vstup (čeština)
  useEffect(() => {
    const W = window as any;
    const SR = W.webkitSpeechRecognition || W.SpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'cs-CZ';
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setInput(t); void send(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
  }, [send]);

  const toggleMic = () => {
    const rec = recognitionRef.current;
    if (!rec) { notify('Mikrofon není v tomhle prohlížeči podporovaný. Napiš to prosím.'); return; }
    if (listening) { rec.stop(); return; }
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { notify('Foto je moc velké (max 5 MB). Zkus horší kvalitu.'); return; }
    try { const img = await fileToImage(file); void send(input.trim() || undefined, img); }
    catch { notify('Foto se nepodařilo načíst.'); }
  };

  return (
    <div className="flex flex-col">
      {/* Zprávy */}
      <div className="mb-3 max-h-[52vh] min-h-[220px] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-[#fbf9f4] p-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${m.role === 'user' ? 'bg-blue-500' : 'bg-emerald-600'}`}>
              {m.role === 'user' ? <User className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
            </div>
            <div className={`max-w-[82%] rounded-2xl p-3 text-lg ${m.role === 'user' ? 'bg-blue-500 text-white' : 'border border-slate-200 bg-white text-slate-900'}`}>
              {m.image && <img src={m.image} alt="foto" className="mb-2 max-h-40 w-auto rounded-lg border border-black/10" />}
              {/* AI občas pošle markdown hvězdičky — chat je nevykresluje, tak je schovej */}
              <p className="whitespace-pre-wrap">{m.content.replace(/\*\*/g, '')}</p>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600"><Bot className="h-5 w-5 text-white" /></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <p className="mb-2 px-1 text-sm text-slate-400">Např.: „extruder 2 dělá divný zvuk" · „došlo mazivo" · „zapiš že jsem vyměnil nůž na loupačce".</p>

      {/* Vstup */}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
      <div className="flex gap-2">
        <button
          onClick={toggleMic}
          title="Mluvit"
          className={`flex min-h-14 min-w-14 items-center justify-center rounded-2xl transition ${listening ? 'animate-pulse bg-red-500 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          {listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>
        <button
          onClick={() => photoRef.current?.click()}
          title="Vyfotit"
          className="flex min-h-14 min-w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
        >
          <Camera className="h-6 w-6" />
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={listening ? 'Poslouchám…' : 'Napiš, co se děje…'}
          className="min-h-14 flex-1 rounded-2xl border-2 border-slate-200 bg-[#fbf9f4] px-4 text-lg text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-400"
          disabled={listening}
        />
        <button
          onClick={() => send()}
          disabled={busy || (!input.trim())}
          className="flex min-h-14 min-w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          <Send className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
