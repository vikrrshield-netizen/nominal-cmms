// src/hooks/useConfirm.tsx
// VIKRR — Asset Shield — hezké potvrzovací okno (Ano/Ne) místo systémových popupů.
// Použití v komponentě:
//   const { ask, notify } = useConfirm();
//   if (await ask({ message: 'Opravdu smazat?', danger: true })) { ... }
//   notify('Uloženo');           // jen zpráva s tlačítkem OK (nemusí se awaitovat)
//
// POZOR: jmenuje se `ask` (NE `confirm`), aby se to nepletlo s window.confirm.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

interface AskOpts {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
interface NotifyOpts {
  title?: string;
  message: string;
}

type DialogState =
  | { kind: 'ask'; opts: AskOpts; resolve: (v: boolean) => void }
  | { kind: 'notify'; opts: NotifyOpts; resolve: () => void }
  | null;

interface ConfirmCtx {
  ask: (opts: AskOpts | string) => Promise<boolean>;
  notify: (opts: NotifyOpts | string) => Promise<void>;
}

const Ctx = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const ask = useCallback((o: AskOpts | string) => {
    const opts = typeof o === 'string' ? { message: o } : o;
    return new Promise<boolean>((resolve) => setDialog({ kind: 'ask', opts, resolve }));
  }, []);

  const notify = useCallback((o: NotifyOpts | string) => {
    const opts = typeof o === 'string' ? { message: o } : o;
    return new Promise<void>((resolve) => setDialog({ kind: 'notify', opts, resolve }));
  }, []);

  const close = (val: boolean) => {
    setDialog((d) => {
      if (d) {
        if (d.kind === 'ask') d.resolve(val);
        else d.resolve();
      }
      return null;
    });
  };

  const danger = dialog?.kind === 'ask' && dialog.opts.danger;

  return (
    <Ctx.Provider value={{ ask, notify }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${danger ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                {danger ? <AlertTriangle className="h-6 w-6" /> : <Info className="h-6 w-6" />}
              </div>
              {dialog.opts.title && <h3 className="text-base font-black text-slate-900">{dialog.opts.title}</h3>}
              <p className="max-h-[50vh] w-full overflow-y-auto whitespace-pre-wrap text-sm text-slate-700">{dialog.opts.message}</p>
            </div>
            <div className="mt-5 flex gap-2">
              {dialog.kind === 'ask' ? (
                <>
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    {dialog.opts.cancelText ?? 'Ne'}
                  </button>
                  <button
                    type="button"
                    onClick={() => close(true)}
                    className={`min-h-11 flex-1 rounded-xl font-bold text-white transition ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                  >
                    {dialog.opts.confirmText ?? 'Ano'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => close(true)}
                  className="min-h-11 flex-1 rounded-xl bg-emerald-600 font-bold text-white transition hover:bg-emerald-500"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfirm musí být uvnitř <ConfirmProvider>');
  return ctx;
}
