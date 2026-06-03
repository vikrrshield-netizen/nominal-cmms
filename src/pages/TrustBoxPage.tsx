// src/pages/TrustBoxPage.tsx
// VIKRSHIELD - prijem anonymnich zprav ze schranky duvery.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Lightbulb,
  MessageSquare,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useAuthContext } from '../context/AuthContext';
import { Breadcrumb } from '../components/ui';

type MessageCategory = 'safety' | 'harassment' | 'improvement' | 'other';

interface TrustMessage {
  id: string;
  category: MessageCategory;
  message: string;
  createdAt: Date;
  isRead: boolean;
}

const CATEGORIES: Record<MessageCategory, { label: string; description: string; icon: typeof Shield; tone: string }> = {
  safety: {
    label: 'Bezpecnost',
    description: 'Ohrozeni zdravi nebo nebezpecne praktiky',
    icon: AlertTriangle,
    tone: 'border-red-300 bg-red-50 text-red-700',
  },
  harassment: {
    label: 'Obtezovani',
    description: 'Sikana, diskriminace nebo nevhodne chovani',
    icon: Shield,
    tone: 'border-purple-300 bg-purple-50 text-purple-700',
  },
  improvement: {
    label: 'Zlepseni',
    description: 'Navrhy na zlepseni a napady',
    icon: Lightbulb,
    tone: 'border-amber-300 bg-amber-50 text-amber-700',
  },
  other: {
    label: 'Ostatni',
    description: 'Cokoliv jineho',
    icon: MessageSquare,
    tone: 'border-sky-300 bg-sky-50 text-sky-700',
  },
};

const CATEGORY_IDS: MessageCategory[] = ['safety', 'harassment', 'improvement', 'other'];

function toCategory(value: unknown): MessageCategory {
  return CATEGORY_IDS.includes(value as MessageCategory) ? (value as MessageCategory) : 'other';
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function formatDate(date: Date) {
  return date.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TrustBoxPage() {
  const navigate = useNavigate();
  const goBack = useBackNavigation('/');
  const { canViewSecretBox } = useAuthContext();

  const [messages, setMessages] = useState<TrustMessage[]>([]);
  const [readError, setReadError] = useState('');

  useEffect(() => {
    if (!canViewSecretBox) {
      setMessages([]);
      return;
    }

    const inbox = query(collection(db, 'trustbox'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      inbox,
      (snap) => {
        setReadError('');
        setMessages(
          snap.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              category: toCategory(data.category),
              message: String(data.message || ''),
              createdAt: toDate(data.createdAt),
              isRead: data.status !== 'new',
            };
          }),
        );
      },
      (err) => {
        console.error('[TrustBox] read error:', err);
        setReadError('Zpravy se nepodarilo nacist.');
        setMessages([]);
      },
    );
  }, [canViewSecretBox]);

  const unreadCount = useMemo(() => messages.filter((message) => !message.isRead).length, [messages]);

  const handleMarkRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'trustbox', id), {
        status: 'read',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[TrustBox] mark read error:', err);
    }
  };

  if (!canViewSecretBox) {
    return (
      <div className="vik-page-shell flex min-h-screen items-center justify-center">
        <div className="vik-card max-w-lg p-6 text-center">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-slate-500" />
          <h1 className="mb-2 text-2xl font-black text-slate-950">Bez opravneni</h1>
          <p className="mb-5 text-slate-600">Schranku duvery mohou cist jen opravnene osoby.</p>
          <button type="button" onClick={() => goBack()} className="vik-button-primary min-h-12 px-5">
            Zpet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vik-page-shell min-h-screen pb-24">
      <div className="mx-auto w-full max-w-6xl px-4 py-5">
        <Breadcrumb
          items={[
            { label: 'Dashboard', onClick: () => navigate('/') },
            { label: 'Schranka duvery' },
          ]}
        />

        <header className="vik-card mb-5 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => goBack()} className="vik-icon-button h-12 w-12">
                <span className="sr-only">Zpet</span>
                <ShieldCheck className="h-6 w-6" />
              </button>
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-purple-700">Prijem zprav</div>
                <h1 className="text-3xl font-black text-slate-950">Schranka duvery</h1>
                <p className="text-sm font-semibold text-slate-600">Tady se jen ctou anonymni zpravy z kiosku.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-right">
              <div className="text-3xl font-black text-purple-700">{unreadCount}</div>
              <div className="text-xs font-black uppercase text-purple-700">neprectene</div>
            </div>
          </div>
        </header>

        {readError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">
            {readError}
          </div>
        )}

        {messages.length === 0 ? (
          <div className="vik-card p-8 text-center">
            <MessageSquare className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <h2 className="text-xl font-black text-slate-950">Zadne zpravy</h2>
            <p className="mt-1 text-slate-600">Jakmile nekdo odesle zpravu z kiosku, objevi se tady.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {messages.map((message) => {
              const category = CATEGORIES[message.category];
              const Icon = category.icon;
              return (
                <article
                  key={message.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    message.isRead ? 'border-slate-200' : 'border-purple-300 ring-2 ring-purple-100'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${category.tone}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-black text-slate-950">{category.label}</h2>
                        {!message.isRead && (
                          <span className="rounded-full bg-purple-600 px-2 py-1 text-xs font-black uppercase text-white">
                            nove
                          </span>
                        )}
                        <span className="text-sm font-semibold text-slate-500 sm:ml-auto">{formatDate(message.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{category.description}</p>
                      <p className="mt-3 whitespace-pre-wrap break-words text-lg font-semibold leading-relaxed text-slate-900">
                        {message.message}
                      </p>
                    </div>
                    {!message.isRead && (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(message.id)}
                        className="vik-button min-h-12 shrink-0 gap-2 px-4"
                      >
                        <Eye className="h-5 w-5" />
                        Precteno
                      </button>
                    )}
                    {message.isRead && (
                      <div className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-black text-emerald-700">
                        <CheckCircle2 className="h-5 w-5" />
                        Precteno
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
