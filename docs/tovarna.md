# Továrna — budovy, zóny, místnosti

Zdroj pravdy: `src/data/factory.ts`.

Závod na výrobu potravin. Klíčové je dělení na **zóny** kvůli křížové kontaminaci
lepkem — každá místnost má zónu `GLUTEN`, `GLUTEN_FREE` nebo `NEUTRAL`.

## Budovy

| ID | Název | Popis |
|----|-------|-------|
| **A** | Administrativa | Kanceláře, vedení |
| **B** | Krček | Spojovací budova |
| **C** | Zázemí/Vedení | Šatny, sociální zázemí |
| **D** | VÝROBA | Mlýn, míchárna, balírna, velín, sklady, kotelna |
| **E** | Dílna + Sklad ND | Dílna, sklad náhradních dílů, garáž |

> Pozn.: `CLAUDE.md` historicky zmiňuje i budovu **L** — pokud se objeví v datech,
> doplň ji sem podle `factory.ts`.

## Zóny

- **GLUTEN** — provozy pracující s lepkem (mlýn, míchárna, balírna, velín extruze…)
- **GLUTEN_FREE** — bezlepkový provoz (musí být oddělený)
- **NEUTRAL** — kanceláře, chodby, zázemí

## Místnosti

Místnost má `id` ve tvaru `<budova>-<kód>` (např. `D-MLY` = Mlýn, `D-MIC` =
Míchárna, `A-01` = Recepce), patro (`floor`), zónu a kategorii (`production`,
`office`, `utility`, …). Každý **asset** i **úkol** se váže na budovu/místnost.

## Související

- [[domena]] — úkoly vázané na lokaci
- [[role]] — VÝROBA řeší zóny a priority, ÚDRŽBA stroje
