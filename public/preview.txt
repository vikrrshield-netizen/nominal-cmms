import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════
// NOMINAL CMMS — Modulární Dashboard (Fáze 9)
// Wireframe: tile grid, 4col desktop / 2col mobile
// Přizpůsobitelné moduly, ⊕ pro přidání
// ═══════════════════════════════════════════════════════

// Mock data (bude nahrazeno Firestore hooks)
const MOCK = {
  tasks: { total: 15, p1: 2, p2: 4, inProgress: 3, backlog: 6 },
  assets: { total: 145, operational: 138, maintenance: 4, breakdown: 3 },
  revisions: { total: 8, ok: 5, warning: 2, critical: 1, nextDue: "22.02." },
  team: [
    { name: "Vilém", role: "SUPERADMIN", color: "#3b82f6", online: true },
    { name: "Zdeněk", role: "ÚDRŽBA", color: "#10b981", online: true },
    { name: "Petr", role: "ÚDRŽBA", color: "#f59e0b", online: false },
    { name: "Filip", role: "FLEET", color: "#8b5cf6", online: false },
    { name: "Pavla", role: "VÝROBA", color: "#ef4444", online: true },
  ],
  waste: [
    { type: "Komunál", status: "green", day: "Čtvrtek", fill: 35 },
    { type: "Plast", status: "yellow", day: "Pátek", fill: 72 },
    { type: "Papír", status: "red", day: "Pondělí", fill: 91 },
  ],
  fleet: [
    { name: "JCB", status: "available" },
    { name: "New Holland", status: "in_use" },
    { name: "Shibaura", status: "maintenance" },
    { name: "Sekačka", status: "available" },
  ],
  trustbox: { unread: 3 },
  inventory: { lowStock: 5, totalItems: 48 },
};

// Module definitions
const ALL_MODULES = [
  { id: "tasks", label: "Úkoly", icon: "📋", size: "wide" },
  { id: "assets", label: "Stroje", icon: "⚙️", size: "normal" },
  { id: "revisions", label: "Revize", icon: "🔍", size: "normal" },
  { id: "team", label: "Tým", icon: "👥", size: "normal" },
  { id: "waste", label: "Odpady", icon: "🗑️", size: "normal" },
  { id: "fleet", label: "Vozidla", icon: "🚜", size: "normal" },
  { id: "trustbox", label: "Schránka důvěry", icon: "🔒", size: "normal" },
  { id: "inventory", label: "Sklad ND", icon: "📦", size: "normal" },
];

const STATUS_COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  operational: "#22c55e",
  maintenance: "#eab308",
  breakdown: "#ef4444",
  offline: "#64748b",
  available: "#22c55e",
  in_use: "#3b82f6",
};

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export default function DashboardPage() {
  const [activeModules, setActiveModules] = useState([
    "tasks", "assets", "revisions", "team", "waste", "fleet", "trustbox", "inventory"
  ]);
  const [showPicker, setShowPicker] = useState(false);
  const [expandedModule, setExpandedModule] = useState(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const toggleModule = (id) => {
    setActiveModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const greeting = () => {
    const h = time.getHours();
    if (h < 12) return "Dobré ráno";
    if (h < 18) return "Dobré odpoledne";
    return "Dobrý večer";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        color: "#e2e8f0",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        padding: "16px",
        position: "relative",
        overflow: "auto",
      }}
    >
      {/* NOISE TEXTURE OVERLAY */}
      <div style={{
        position: "fixed", inset: 0, opacity: 0.03, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />

      {/* HEADER */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 20, padding: "8px 4px",
      }}>
        <div>
          <div style={{ fontSize: 13, color: "#64748b", letterSpacing: 2, textTransform: "uppercase" }}>
            NOMINAL CMMS
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginTop: 2 }}>
            {greeting()}, Viléme
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
            {time.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        <button
          onClick={() => setShowPicker(!showPicker)}
          style={{
            width: 44, height: 44, borderRadius: 12,
            background: showPicker ? "#3b82f6" : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: showPicker ? "#fff" : "#94a3b8",
            fontSize: 22, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s",
            backdropFilter: "blur(8px)",
          }}
        >
          {showPicker ? "✕" : "＋"}
        </button>
      </div>

      {/* MODULE PICKER */}
      {showPicker && (
        <div style={{
          background: "rgba(30,41,59,0.95)", borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)",
          padding: 16, marginBottom: 16,
          backdropFilter: "blur(16px)",
        }}>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12, letterSpacing: 1 }}>
            MODULY — klikni pro zapnout/vypnout
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ALL_MODULES.map((mod) => {
              const isActive = activeModules.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  onClick={() => toggleModule(mod.id)}
                  style={{
                    padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                    border: isActive ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)",
                    background: isActive ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)",
                    color: isActive ? "#93c5fd" : "#64748b",
                    fontSize: 13, fontFamily: "inherit",
                    transition: "all 0.2s",
                  }}
                >
                  {mod.icon} {mod.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* URGENT BANNER - P1 */}
      {MOCK.tasks.p1 > 0 && (
        <div style={{
          background: "linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 12, padding: "12px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", background: "#ef4444",
            animation: "pulse 2s infinite",
            boxShadow: "0 0 8px rgba(239,68,68,0.6)",
          }} />
          <span style={{ fontSize: 14, color: "#fca5a5", fontWeight: 600 }}>
            {MOCK.tasks.p1}× P1 HAVÁRIE
          </span>
          <span style={{ fontSize: 12, color: "#64748b" }}>— vyžaduje okamžitou pozornost</span>
        </div>
      )}

      {/* MODULE GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {activeModules.map((modId) => {
          const mod = ALL_MODULES.find((m) => m.id === modId);
          if (!mod) return null;
          const isExpanded = expandedModule === modId;
          return (
            <div
              key={modId}
              onClick={() => setExpandedModule(isExpanded ? null : modId)}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 16, padding: 16, cursor: "pointer",
                transition: "all 0.25s ease",
                backdropFilter: "blur(8px)",
                gridColumn: mod.size === "wide" && !isExpanded ? "span 2" : "span 1",
                ...(isExpanded ? {
                  gridColumn: "1 / -1",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(59,130,246,0.2)",
                } : {}),
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isExpanded ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)";
                e.currentTarget.style.borderColor = isExpanded ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)";
              }}
            >
              {/* Module Header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: isExpanded ? 16 : 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{mod.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", letterSpacing: 0.5 }}>
                    {mod.label}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "#475569" }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {/* Module Content */}
              {modId === "tasks" && <TasksModule expanded={isExpanded} />}
              {modId === "assets" && <AssetsModule expanded={isExpanded} />}
              {modId === "revisions" && <RevisionsModule expanded={isExpanded} />}
              {modId === "team" && <TeamModule expanded={isExpanded} />}
              {modId === "waste" && <WasteModule expanded={isExpanded} />}
              {modId === "fleet" && <FleetModule expanded={isExpanded} />}
              {modId === "trustbox" && <TrustboxModule expanded={isExpanded} />}
              {modId === "inventory" && <InventoryModule expanded={isExpanded} />}
            </div>
          );
        })}
      </div>

      {/* PULSE ANIMATION */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MODULE COMPONENTS
// ═══════════════════════════════════════════════════════

function StatRow({ label, value, color, bar }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {bar !== undefined && (
          <div style={{ width: 48, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
            <div style={{ width: `${bar}%`, height: "100%", borderRadius: 2, background: color || "#3b82f6" }} />
          </div>
        )}
        <span style={{ fontSize: 14, fontWeight: 700, color: color || "#f1f5f9", fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function TasksModule({ expanded }) {
  const d = MOCK.tasks;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: expanded ? 16 : 0 }}>
        <MiniCard label="P1" value={d.p1} color="#ef4444" />
        <MiniCard label="P2" value={d.p2} color="#f59e0b" />
        <MiniCard label="Probíhá" value={d.inProgress} color="#3b82f6" />
        <MiniCard label="Backlog" value={d.backlog} color="#64748b" />
      </div>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, letterSpacing: 1 }}>NEJNOVĚJŠÍ</div>
          {["Extruder 1: Zaseknutý materiál", "Balička Karel: Hluk", "Kompresor: Preventivní údržba"].map((t, i) => (
            <div key={i} style={{
              padding: "8px 12px", borderRadius: 8, marginBottom: 4,
              background: "rgba(255,255,255,0.03)", fontSize: 12, color: "#94a3b8",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: i === 0 ? "#ef4444" : i === 1 ? "#f59e0b" : "#3b82f6" }} />
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetsModule({ expanded }) {
  const d = MOCK.assets;
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", marginBottom: 4 }}>
        {d.total}
      </div>
      <StatRow label="Provozuschopné" value={d.operational} color="#22c55e" bar={(d.operational / d.total) * 100} />
      <StatRow label="Údržba" value={d.maintenance} color="#eab308" bar={(d.maintenance / d.total) * 100} />
      <StatRow label="Porucha" value={d.breakdown} color="#ef4444" bar={(d.breakdown / d.total) * 100} />
      {expanded && (
        <div style={{ marginTop: 12, fontSize: 11, color: "#475569", textAlign: "center" }}>
          → Otevřít Mapu strojů
        </div>
      )}
    </div>
  );
}

function RevisionsModule({ expanded }) {
  const d = MOCK.revisions;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <MiniCard label="OK" value={d.ok} color="#22c55e" />
        <MiniCard label="Varování" value={d.warning} color="#eab308" />
        <MiniCard label="Kritické" value={d.critical} color="#ef4444" />
      </div>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>
        Další termín: <span style={{ color: "#f59e0b", fontWeight: 600 }}>{d.nextDue}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {["ELEC — Budova D — 22.02.", "FIRE — Budova A — 15.03.", "PRESSURE — Kotelna — 01.04."].map((r, i) => (
            <div key={i} style={{
              padding: "6px 10px", borderRadius: 6, marginBottom: 4,
              background: "rgba(255,255,255,0.03)", fontSize: 11, color: "#94a3b8",
            }}>
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamModule({ expanded }) {
  return (
    <div>
      <div style={{ display: "flex", gap: -4, marginBottom: expanded ? 12 : 0 }}>
        {MOCK.team.map((member, i) => (
          <div
            key={i}
            title={`${member.name} (${member.role})`}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: member.color, display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: "#fff",
              border: "2px solid #1e293b",
              marginLeft: i > 0 ? -6 : 0,
              opacity: member.online ? 1 : 0.4,
              position: "relative",
            }}
          >
            {member.name.charAt(0)}
            {member.online && (
              <div style={{
                position: "absolute", bottom: -2, right: -2,
                width: 8, height: 8, borderRadius: 4,
                background: "#22c55e", border: "2px solid #1e293b",
              }} />
            )}
          </div>
        ))}
      </div>
      {expanded && (
        <div>
          {MOCK.team.map((m, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 4,
                  background: m.online ? "#22c55e" : "#475569",
                }} />
                <span style={{ fontSize: 13, color: "#cbd5e1" }}>{m.name}</span>
              </div>
              <span style={{ fontSize: 11, color: "#475569" }}>{m.role}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WasteModule({ expanded }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        {MOCK.waste.map((w, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 14, margin: "0 auto 4px",
              background: STATUS_COLORS[w.status],
              opacity: 0.9,
            }} />
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{w.type}</div>
            {expanded && (
              <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                {w.fill}% | {w.day}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FleetModule({ expanded }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {MOCK.fleet.map((v, i) => (
          <div key={i} style={{
            padding: "8px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: 4,
              background: STATUS_COLORS[v.status] || "#64748b",
            }} />
            <span style={{ fontSize: 12, color: "#cbd5e1" }}>{v.name}</span>
          </div>
        ))}
      </div>
      {expanded && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#475569", textAlign: "center" }}>
          → Správa vozového parku
        </div>
      )}
    </div>
  );
}

function TrustboxModule({ expanded }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: "#a78bfa" }}>
          {MOCK.trustbox.unread}
        </span>
        <span style={{ fontSize: 12, color: "#64748b" }}>nepřečtených</span>
      </div>
      {expanded && (
        <div style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 8,
          background: "rgba(167,139,250,0.08)",
          border: "1px solid rgba(167,139,250,0.15)",
          fontSize: 12, color: "#a78bfa",
        }}>
          Anonymní zprávy — pouze pro vedení
        </div>
      )}
    </div>
  );
}

function InventoryModule({ expanded }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b" }}>
          {MOCK.inventory.lowStock}
        </span>
        <span style={{ fontSize: 12, color: "#64748b" }}>pod minimem</span>
      </div>
      <StatRow label="Celkem položek" value={MOCK.inventory.totalItems} />
      {expanded && (
        <div style={{ marginTop: 8 }}>
          {["Ložisko 6205 (2 ks)", "Řemen XPZ-1000 (1 ks)", "Filtr olej. HF-35 (0 ks)"].map((item, i) => (
            <div key={i} style={{
              padding: "6px 10px", borderRadius: 6, marginBottom: 4,
              background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.1)",
              fontSize: 11, color: "#fbbf24",
            }}>
              ⚠ {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniCard({ label, value, color }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8,
      background: `${color}11`,
      border: `1px solid ${color}22`,
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{label}</div>
    </div>
  );
}
