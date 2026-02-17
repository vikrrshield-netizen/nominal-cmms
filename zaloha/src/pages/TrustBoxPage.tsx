// src/pages/TrustBoxPage.tsx
// NOMINAL CMMS — Schránka důvěry (anonymní hlášení)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { Breadcrumb } from '../components/ui';
import { 
  Shield, Send, CheckCircle2, Lock, Eye, EyeOff,
  MessageSquare, AlertTriangle, Heart, Lightbulb
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type MessageCategory = 'safety' | 'harassment' | 'improvement' | 'other';

interface TrustMessage {
  id: string;
  category: MessageCategory;
  message: string;
  createdAt: Date;
  isRead: boolean;
  response?: string;
  respondedAt?: Date;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const CATEGORIES: { id: MessageCategory; label: string; icon: typeof Shield; color: string; description: string }[] = [
  { id: 'safety', label: 'Bezpečnost', icon: AlertTriangle, color: 'text-red-600 bg-red-50', description: 'Ohrožení zdraví, nebezpečné praktiky' },
  { id: 'harassment', label: 'Obtěžování', icon: Shield, color: 'text-purple-600 bg-purple-50', description: 'Šikana, diskriminace, nevhodné chování' },
  { id: 'improvement', label: 'Zlepšení', icon: Lightbulb, color: 'text-amber-600 bg-amber-50', description: 'Návrhy na zlepšení, nápady' },
  { id: 'other', label: 'Ostatní', icon: MessageSquare, color: 'text-blue-600 bg-blue-50', description: 'Cokoliv jiného' },
];

// Mock messages for admin view
const MOCK_MESSAGES: TrustMessage[] = [
  {
    id: 'm1',
    category: 'safety',
    message: 'Na balicí lince chybí bezpečnostní kryt. Několikrát jsem viděl, jak tam někdo málem přišel k úrazu.',
    createdAt: new Date('2026-02-10T14:30:00'),
    isRead: true,
    response: 'Děkujeme za upozornění. Kryt byl doplněn a provedena kontrola všech bezpečnostních prvků.',
    respondedAt: new Date('2026-02-11T09:00:00'),
  },
  {
    id: 'm2',
    category: 'improvement',
    message: 'Bylo by fajn mít v šatně více skříněk. Teď se tam tísníme.',
    createdAt: new Date('2026-02-08T11:00:00'),
    isRead: true,
  },
  {
    id: 'm3',
    category: 'other',
    message: 'Automat na kávu už týden nefunguje a nikdo to neřeší.',
    createdAt: new Date('2026-02-11T16:45:00'),
    isRead: false,
  },
];

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function TrustBoxPage() {
  const navigate = useNavigate();
  const { canViewSecretBox, user: _u } = useAuthContext();

  // State
  const [selectedCategory, setSelectedCategory] = useState<MessageCategory | null>(null);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [viewMode, setViewMode] = useState<'submit' | 'admin'>('submit');
  const [messages, setMessages] = useState<TrustMessage[]>(MOCK_MESSAGES);

  // ─────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedCategory || !message.trim()) return;

    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(r => setTimeout(r, 1000));

    // In real app: Send to Firestore with server timestamp
    console.log('TRUSTBOX_SUBMIT:', {
      category: selectedCategory,
      message: message.trim(),
      // NO user ID - anonymous!
    });

    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  const handleReset = () => {
    setSelectedCategory(null);
    setMessage('');
    setIsSubmitted(false);
  };

  const handleMarkRead = (id: string) => {
    setMessages(prev => prev.map(m => 
      m.id === id ? { ...m, isRead: true } : m
    ));
  };

  // ─────────────────────────────────────────────────────────────────
  // RENDER: SUCCESS
  // ─────────────────────────────────────────────────────────────────

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Odesláno</h1>
        <p className="text-slate-400 mb-8 max-w-sm">
          Vaše zpráva byla anonymně odeslána. Děkujeme za důvěru.
        </p>
        <button
          onClick={handleReset}
          className="px-6 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600"
        >
          Odeslat další zprávu
        </button>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-slate-500 hover:text-white"
        >
          Zpět na dashboard
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RENDER: ADMIN VIEW
  // ─────────────────────────────────────────────────────────────────

  if (viewMode === 'admin' && canViewSecretBox) {
    const unreadCount = messages.filter(m => !m.isRead).length;

    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="bg-white border-b px-4 py-4">
          <Breadcrumb items={[
            { label: 'Dashboard', onClick: () => navigate('/') },
            { label: 'Schránka důvěry' },
          ]} />
          
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-6 h-6 text-purple-600" />
              Schránka důvěry
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </h1>
            <button
              onClick={() => setViewMode('submit')}
              className="text-sm text-purple-600 font-medium"
            >
              Odeslat zprávu
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Žádné zprávy</p>
            </div>
          ) : (
            messages.map(msg => {
              const cat = CATEGORIES.find(c => c.id === msg.category)!;
              const Icon = cat.icon;

              return (
                <div 
                  key={msg.id}
                  className={`bg-white rounded-xl border p-4 ${!msg.isRead ? 'border-purple-300 bg-purple-50/30' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cat.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-slate-800">{cat.label}</span>
                        {!msg.isRead && (
                          <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[10px] font-bold rounded">
                            NOVÉ
                          </span>
                        )}
                        <span className="text-xs text-slate-400 ml-auto">
                          {msg.createdAt.toLocaleDateString('cs-CZ')}
                        </span>
                      </div>
                      <p className="text-slate-700">{msg.message}</p>
                      
                      {msg.response && (
                        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <div className="text-xs text-emerald-600 mb-1">Odpověď:</div>
                          <p className="text-sm text-emerald-800">{msg.response}</p>
                        </div>
                      )}

                      {!msg.isRead && (
                        <button
                          onClick={() => handleMarkRead(msg.id)}
                          className="mt-3 text-sm text-purple-600 font-medium flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" /> Označit jako přečtené
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RENDER: SUBMIT FORM
  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      
      {/* Header */}
      <div className="bg-slate-800 px-4 py-6 text-center">
        <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-purple-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Schránka důvěry</h1>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Anonymní prostor pro sdílení obav, problémů nebo nápadů
        </p>
        
        {/* Privacy badge */}
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700 rounded-full">
          <Lock className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-slate-300">100% anonymní</span>
        </div>

        {canViewSecretBox && (
          <button
            onClick={() => setViewMode('admin')}
            className="mt-4 block mx-auto text-sm text-purple-400 hover:text-purple-300"
          >
            Zobrazit přijaté zprávy →
          </button>
        )}
      </div>

      <div className="p-4 space-y-6">
        
        {/* Category Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-3">
            O čem chcete napsat?
          </label>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    isSelected 
                      ? 'border-purple-500 bg-purple-500/10' 
                      : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-purple-400' : 'text-slate-500'}`} />
                  <div className={`font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                    {cat.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{cat.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Input */}
        {selectedCategory && (
          <div className="animate-fadeIn">
            <label className="block text-sm font-medium text-slate-400 mb-3">
              Vaše zpráva
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Napište zde svou zprávu... Bude zcela anonymní."
              className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 resize-none focus:border-purple-500 focus:outline-none"
              rows={6}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-500">
                {message.length} znaků
              </span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <EyeOff className="w-3 h-3" /> Bez identifikace
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        {selectedCategory && message.trim() && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 animate-fadeIn"
          >
            {isSubmitting ? (
              <>Odesílám...</>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Odeslat anonymně
              </>
            )}
          </button>
        )}

        {/* Trust info */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Heart className="w-5 h-5 text-pink-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-400">
              <p className="mb-2">
                <strong className="text-slate-300">Vaše bezpečí je prioritou.</strong>
              </p>
              <p>
                Zprávy jsou zcela anonymní – neukládáme žádné identifikační údaje. 
                Pouze oprávněné osoby mohou číst a reagovat na podněty.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fade in animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
