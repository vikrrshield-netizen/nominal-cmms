// src/pages/AIAssistantPage.tsx
// NOMINAL CMMS — AI Asistent s hlasovými příkazy

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { 
  Sparkles, Mic, MicOff, Send, ArrowLeft, Bot, User,
 AlertTriangle, Package, Calendar, FileText,
 Volume2, VolumeX, Loader2, CheckCircle2
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: AIAction;
}

interface AIAction {
  type: 'create_task' | 'check_inventory' | 'schedule' | 'report' | 'info';
  data?: any;
  executed?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// MOCK AI RESPONSES
// ═══════════════════════════════════════════════════════════════════

const AI_RESPONSES: Record<string, { response: string; action?: AIAction }> = {
  'porucha': {
    response: 'Rozumím, chcete nahlásit poruchu. Na kterém stroji je problém? Můžete říct název nebo kód stroje.',
    action: { type: 'create_task' }
  },
  'extruder': {
    response: 'Vytvořím hlášení poruchy pro Extruder. Jaký je popis problému?',
    action: { type: 'create_task', data: { asset: 'Extruder 1' } }
  },
  'balička': {
    response: 'Balička Karel, Lojza nebo U Agáty? Upřesněte prosím.',
    action: { type: 'create_task' }
  },
  'karel': {
    response: '✅ Vytvořil jsem hlášení poruchy pro Baličku Karel s prioritou P2. Úkol byl přiřazen do backlogu.',
    action: { type: 'create_task', data: { asset: 'Balička Karel', priority: 'P2' }, executed: true }
  },
  'sklad': {
    response: 'Stav skladu: 3 položky v kritickém stavu (červená), 5 položek s nízkým stavem (žlutá). Chcete zobrazit detail nebo vytvořit objednávku?',
    action: { type: 'check_inventory' }
  },
  'objednat': {
    response: 'Jaký díl chcete objednat? Můžete říct název nebo katalogové číslo.',
    action: { type: 'check_inventory' }
  },
  'ložisko': {
    response: '✅ Přidal jsem ložisko SKF 6205 do objednávky. Aktuální stav: 2 ks, minimum: 5 ks. Chcete objednat doporučené množství 10 ks?',
    action: { type: 'check_inventory', data: { part: 'SKF 6205', qty: 10 }, executed: true }
  },
  'revize': {
    response: 'Máte 2 kritické revize: Hasicí přístroje (do 1.3.) a Kalibrace vah (do 28.2.). Chcete zobrazit detail nebo naplánovat?',
    action: { type: 'schedule' }
  },
  'report': {
    response: 'Tento měsíc: 47 dokončených úkolů, průměrná doba opravy 2.4h, 87% úkolů dokončeno včas. Chcete exportovat report?',
    action: { type: 'report' }
  },
  'help': {
    response: 'Můžu vám pomoct s:\n• Nahlášení poruchy\n• Kontrola skladu\n• Přehled revizí\n• Statistiky a reporty\n• Plánování úkolů\n\nŘekněte co potřebujete!',
    action: { type: 'info' }
  },
};

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
      content: `Ahoj ${user?.displayName || 'uživateli'}! 👋 Jsem AI asistent pro NOMINAL CMMS. Můžu vám pomoct s hlášením poruch, kontrolou skladu, přehledem revizí a dalšími úkoly. Co potřebujete?`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'cs-CZ';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSend(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };
    }
  }, []);

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

  // @ts-ignore
// eslint-disable-next-line
const _speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'cs-CZ';
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      speechSynthesis.speak(utterance);
    }
  };

  const getAIResponse = (userMessage: string): { response: string; action?: AIAction } => {
    const lowerMessage = userMessage.toLowerCase();
    
    // Check keywords
    for (const [keyword, data] of Object.entries(AI_RESPONSES)) {
      if (lowerMessage.includes(keyword)) {
        return data;
      }
    }
    
    // Default response
    return {
      response: 'Nerozuměl jsem. Zkuste to prosím jinak nebo řekněte "help" pro seznam příkazů.',
      action: { type: 'info' }
    };
  };

  const handleSend = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    // Get AI response
    const { response, action } = getAIResponse(text);
    
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      action,
    };
    setMessages(prev => [...prev, assistantMessage]);
    setIsProcessing(false);

    // Optionally speak the response
    // speakText(response);
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
              <h1 className="text-lg font-bold text-white">AI Asistent</h1>
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
              
              {message.action?.executed && (
                <div className="mt-2 pt-2 border-t border-white/20 flex items-center gap-2 text-emerald-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Akce provedena
                </div>
              )}
              
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
          💡 Tip: Řekněte "help" pro seznam dostupných příkazů
        </p>
      </div>
    </div>
  );
}
