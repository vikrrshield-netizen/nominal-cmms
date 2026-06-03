import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, FlaskConical, ShieldCheck } from 'lucide-react';
import { PREVIEW_FEATURES } from '../config/previewFeatures';
import { usePreviewFlags } from '../hooks/usePreviewFeature';

const statusLabel = {
  draft: 'Rozpracovane',
  review: 'Ke kontrole',
  ready: 'Pripravene',
};

const statusClass = {
  draft: 'border-amber-200 bg-amber-50 text-amber-800',
  review: 'border-sky-200 bg-sky-50 text-sky-800',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

export default function PreviewPage() {
  const navigate = useNavigate();
  const { flags, setEnabled } = usePreviewFlags();

  return (
    <div className="min-h-screen bg-[var(--vik-bg)] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-[var(--vik-border)] bg-[var(--vik-bg)]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--vik-border)] bg-white text-slate-700 shadow-sm"
            aria-label="Zpet"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Superadmin preview</p>
            <h1 className="truncate text-2xl font-black">Testovaci stranky</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <section className="vik-card mb-4 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black">Jak to budeme pouzivat</h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">
                Nove veci nejdriv zapneme tady jen pro Superadmina. Bezne role uvidi stale starou produkcni verzi.
                Po kontrole se feature flag odstrani nebo se preklopi do bezne aplikace.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {PREVIEW_FEATURES.map((feature) => {
            const enabled = flags[feature.key] === true;
            return (
              <article key={feature.key} className="vik-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black">{feature.title}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass[feature.status]}`}>
                        {statusLabel[feature.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">{feature.description}</p>
                  </div>
                  {enabled && <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-emerald-700" />}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setEnabled(feature.key, !enabled)}
                    className={`min-h-12 rounded-2xl border px-4 text-sm font-black transition ${
                      enabled
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {enabled ? 'Preview zapnute' : 'Zapnout preview'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(feature.targetPath)}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--vik-border)] bg-white px-4 text-sm font-black text-slate-800"
                  >
                    Otevrit modul
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
