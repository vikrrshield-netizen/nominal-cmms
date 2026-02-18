// src/pages/AIAssistantPage.tsx
// VIKRR — Asset Shield — Search & VIKRR AI

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import appConfig from '../appConfig';
import {
  Sparkles, Mic, MicOff, Send, ArrowLeft, Bot, User,
  AlertTriangle, Package, Calendar, FileText,
  Volume2, VolumeX, Loader2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════
// GEMINI AI INTEGRATION
// ═══════════════════════════════════════════════════════════════════

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

const SYSTEM_PROMPT = `Jsi AI asistent ${appConfig.APP_NAME} — systému pro správu údržby potravinářského závodu (${appConfig.COMPANY_NAME}, ${appConfig.COMPANY_ADDRESS}).
Odpovídej VŽDY česky. Buď stručný a profesionální.

MODULY SYSTÉMU:
- Úkoly (Work Orders): P1 Havárie, P2 Urgentní, P3 Běžná, P4 Nápad. Stavy: backlog → planned → in_progress → paused → completed.
- Mapa strojů: Interaktivní mapa budov → místností → strojů. Přidání strojů přes [+] tlačítko.
- Sklad ND: Skladové položky s minimem, automatické notifikace. Kategorie: ložiska, řemeny, těsnění, oleje, filtry, elektro.
- Revize: Hasicí přístroje, elektro, tlakové nádoby, výtahy, plyn, kalibrace. Termíny a zodpovědné osoby.
- Vozidla: VZV, traktory, nakladače, osobní. STK, pojistka, servisní intervaly.
- Odpady: Kontejnery s plněním (zelená/žlutá/červená), harmonogram svozů.
- Loupárna: Specializovaná sekce pro loupání koření.
- Kontroly budov: Inspekce místností s foto-dokumentací, automatické P1 úkoly při závadě.

BUDOVY: A (Administrativa), B (Spojovací krček), C (Zázemí & Vedení), D (Výrobní hala), E (Dílna & Sklad ND), L (Loupárna).

STROJE: Extrudery (EXT-xxx), Míchačky, Balicí linky, Pece, Dopravníky, VZV, Kompresory, Chladicí jednotky, Loupačky.

ROLE UŽIVATELŮ: Majitel (read-only), Vedení (schvalování, finance), Superadmin (technika), Údržba (stroje, sklad), Výroba (zóny, plánování), Operátor (kiosk).

Pomáhej s: hlášením poruch, kontrolou skladu, přehledem revizí, statistikami, plánováním údržby, exportem dat.
Pokud uživatel chce nahlásit poruchu, pomoz mu identifikovat stroj (kód + budova) a popis problému.
Pokud se ptá na stav, uveď konkrétní čísla pokud je máš (jinak řekni že je potřeba zkontrolovat v systému).`;

async function callGeminiAPI(userMessage: string, history: Message[]): Promise<string> {
  if (!GEMINI_API_KEY) {
    return getFallbackResponse(userMessage);
  }

  try {
    const contents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: `Rozumím, jsem AI asistent ${appConfig.APP_NAME}. Jak vám mohu pomoci?` }] },
      ...history.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!res.ok) {
      console.error('[AI] Gemini API error:', res.status);
      return getFallbackResponse(userMessage);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || getFallbackResponse(userMessage);
  } catch (err) {
    console.error('[AI] Gemini fetch error:', err);
    return getFallbackResponse(userMessage);
  }
}

function getFallbackResponse(userMessage: string): string {
  const lm = userMessage.toLowerCase();
  if (lm.includes('porucha') || lm.includes('nefunguje') || lm.includes('rozbil'))
    return 'Rozumím, chcete nahlásit poruchu. Na kterém stroji je problém? Můžete říct název nebo kód stroje.';
  if (lm.includes('sklad') || lm.includes('díl') || lm.includes('objednat'))
    return 'Stav skladu: 3 položky v kritickém stavu, 5 s nízkým stavem. Chcete zobrazit detail nebo vytvořit objednávku?';
  if (lm.includes('revize') || lm.includes('kalibrace'))
    return 'Máte 2 kritické revize: Hasicí přístroje a Kalibrace vah. Chcete zobrazit detail?';
  if (lm.includes('report') || lm.includes('statistik'))
    return 'Tento měsíc: 47 dokončených úkolů, průměrná doba opravy 2.4h, 87% dokončeno včas. Chcete exportovat?';
  if (lm.includes('help') || lm.includes('pomoc'))
    return 'Můžu pomoct s:\n• Nahlášení poruchy\n• Kontrola skladu\n• Přehled revizí\n• Statistiky a reporty\n• Plánování úkolů\n\nŘekněte co potřebujete!';
  return 'Nerozuměl jsem. Zkuste to prosím jinak nebo řekněte "help" pro seznam příkazů.';
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
  const navigate = useNavigate();
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
  const [isSpeaking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // handleSend — must be declared before useEffect that uses it
  const handleSend = useCallback(async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    const response = await callGeminiAPI(text, messages);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);
    setIsProcessing(false);
  }, [input, messages]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize speech recognition
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    const SpeechRecognitionClass = W.webkitSpeechRecognition || W.SpeechRecognition;
    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'cs-CZ';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-amber-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-orange-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Search &amp; VIKRR AI</h1>
              <p className="text-xs text-slate-400">
                {isListening ? '🎤 Poslouchám...' : isProcessing ? '🤔 Přemýšlím...' : '✨ Připraven'}
              </p>
            </div>
          </div>

          <button
            onClick={() => isSpeaking ? speechSynthesis.cancel() : null}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition"
          >
            {isSpeaking ? <VolumeX className="w-5 h-5 text-amber-400" /> : <Volume2 className="w-5 h-5 text-slate-400" />}
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
                : 'bg-gradient-to-br from-amber-400 to-orange-500'
            }`}>
              {message.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
            </div>
            
            <div className={`max-w-[80%] p-4 rounded-2xl ${
              message.role === 'user' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white/10 text-white'
            }`}>
              <p className="whitespace-pre-wrap">{message.content}</p>

              <p className="text-xs opacity-60 mt-2">
                {message.timestamp.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white/10 p-4 rounded-2xl">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
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

      {/* Input */}
      <div className="relative z-10 p-4 border-t border-white/10">
        <div className="flex gap-2">
          <button
            onClick={toggleListening}
            className={`p-4 rounded-2xl transition ${
              isListening 
                ? 'bg-red-500 text-white animate-pulse' 
                : 'bg-white/10 text-slate-400 hover:bg-white/20'
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
            className="flex-1 p-4 bg-white/10 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            disabled={isListening}
          />
          
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isProcessing}
            className="p-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-2xl disabled:opacity-50 hover:shadow-lg transition"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
        
        <p className="text-xs text-slate-500 text-center mt-2">
          {GEMINI_API_KEY ? '✨ Powered by Gemini 1.5 Flash' : '💡 Tip: Řekněte "help" pro seznam příkazů'}
        </p>
      </div>
    </div>
  );
}
