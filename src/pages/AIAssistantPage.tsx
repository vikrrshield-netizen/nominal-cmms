// src/pages/AIAssistantPage.tsx
// VIKRR — Asset Shield — Search & VIKRR AI

import { useState, useRef, useEffect, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useAuthContext } from '../context/AuthContext';
import { functions } from '../lib/firebase';
import appConfig from '../appConfig';
import VoiceMemoRecorder from '../components/ui/VoiceMemoRecorder';
import {
  Sparkles, Mic, MicOff, Send, ArrowLeft, Bot, User,
  AlertTriangle, Package, Calendar, FileText,
  Volume2, VolumeX, Loader2, Camera,
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

type AssistantReply = { reply: string; toolsUsed?: string[] };

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
): Promise<string> {
  const callable = httpsCallable<
    { message: string; history: { role: string; content: string }[]; imageData?: string; imageType?: string },
    AssistantReply
  >(functions, 'assistantChat');

  const res = await callable({
    message: userMessage,
    history: history.map((m) => ({ role: m.role, content: m.content })),
    ...(image ? { imageData: image.imageData, imageType: image.imageType } : {}),
  });

  return res.data?.reply || 'Promiň, nepřišla žádná odpověď.';
}

const QUICK_COMMANDS = [
  { label: 'Nahlásit poruchu', icon: AlertTriangle, color: 'bg-red-500', keyword: 'porucha' },
  { label: 'Stav skladu', icon: Package, color: 'bg-emerald-500', keyword: 'sklad' },
  { label: 'Revize', icon: Calendar, color: 'bg-amber-500', keyword: 'revize' },
  { label: 'Report', icon: FileText, color: 'bg-blue-500', keyword: 'report' },
];

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function AIAssistantPage() {
  const goBack = useBackNavigation('/');
  const { user } = useAuthContext();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: `Ahoj ${user?.displayName || 'uživateli'}! 👋 Jsem AI asistent pro ${appConfig.APP_NAME}. Můžu vám pomoct s hlášením poruch, kontrolou skladu, přehledem revizí a dalšími úkoly. Co potřebujete?`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState<boolean>(() => {
    try { return localStorage.getItem('ai-voice') === '1'; } catch { return false; }
  });

  // Foto pro AI
  const photoInputRef = useRef<HTMLInputElement>(null);

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

    let response: string;
    try {
      response = await callAssistant(
        text || 'Popiš, co je na fotce, a poraď nebo zapiš, co je potřeba.',
        messages,
        image ? { imageData: image.imageData, imageType: image.imageType } : undefined,
      );
    } catch (err) {
      console.error('[AI] assistantChat error:', err);
      const e = err as { message?: string };
      response = e?.message || 'AI asistent je teď nedostupný. Zkus to prosím za chvíli.';
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
  }, [input, messages, voiceOn, speak]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      alert('Hlasové ovládání není podporováno ve vašem prohlížeči');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Foto → AI (Claude obrázek přečte a popíše / zapíše)
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Obrázek je moc velký (max 5 MB). Zkus menší / horší kvalitu.'); return; }
    try {
      const img = await fileToImage(file);
      handleSend(input.trim() || undefined, img);
    } catch {
      alert('Foto se nepodařilo načíst.');
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

          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} className="hidden" />
          <button
            onClick={() => photoInputRef.current?.click()}
            title="Vyfotit závadu → AI ji popíše a poradí"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 transition"
          >
            <Camera className="w-5 h-5" />
          </button>

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
