import { useMemo, useState } from 'react'
import { BriefcaseBusiness, Download, LineChart, MoonStar, SunMedium, Upload } from 'lucide-react'
import TransactionForm from './components/TransactionForm'
import PositionsTable from './components/PositionsTable'
import HistoryList from './components/HistoryList'
import AllocationCard from './components/AllocationCard'
import PerformanceChart from './components/PerformanceChart'
import StatCard from './components/StatCard'
import { buildMonthlySeries, computePortfolio, formatCurrency, uid } from './lib/portfolio'

const seedTransactions = [
    { id: uid(), type: 'BUY', ticker: 'MC.PA', name: 'LVMH', date: '2026-02-10', quantity: 3, unitPrice: 712, fees: 1.8, note: 'PEA' },
    { id: uid(), type: 'BUY', ticker: 'AIR.PA', name: 'Air Liquide', date: '2026-03-15', quantity: 5, unitPrice: 178.4, fees: 1.2, note: 'Renforcement' },
    { id: uid(), type: 'SELL', ticker: 'AIR.PA', name: 'Air Liquide', date: '2026-05-04', quantity: 1, unitPrice: 185.3, fees: 1.2, note: 'Prise partielle de bénéfice' },
]

const seedPrices = { 'MC.PA': 735, 'AIR.PA': 182.2 }

export default function App() {
    const [transactions, setTransactions] = useState(seedTransactions)
    const [prices, setPrices] = useState(seedPrices)
    const [theme, setTheme] = useState(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const [error, setError] = useState('')

    const snapshot = useMemo(() => {
        try {
            setError('')
            return computePortfolio(transactions, prices)
        } catch (err) {
            setError(err.message)
            return {
                positions: [],
                invested: 0,
                currentValue: 0,
                unrealizedPnL: 0,
                realizedPnL: 0,
                totalPnL: 0,
                totalFees: 0,
                transactionCount: transactions.length,
            }
        }
    }, [transactions, prices])

    const monthlySeries = useMemo(() => buildMonthlySeries(transactions, prices), [transactions, prices])

    function handleTransactionSubmit(form) {
        const next = {
            id: uid(),
            type: form.type,
            ticker: form.ticker,
            name: form.name || form.ticker,
            date: form.date,
            quantity: form.quantity,
            unitPrice: form.unitPrice,
            fees: form.fees,
            note: form.note,
        }

        if (form.currentPrice && form.currentPrice > 0) {
            setPrices((current) => ({ ...current, [form.ticker]: form.currentPrice }))
        }

        setTransactions((current) => [next, ...current])
    }

    function handlePriceChange(ticker, value) {
        const parsed = Number(value)
        setPrices((current) => ({
            ...current,
            [ticker]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
        }))
    }

    function handleDelete(id) {
        setTransactions((current) => current.filter((tx) => tx.id !== id))
    }

    function handleExport() {
        const payload = { transactions, prices, exportedAt: new Date().toISOString() }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `portfolio-export-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(link.href)
    }

    function handleImport(event) {
        const file = event.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(String(e.target?.result || '{}'))
                if (!Array.isArray(parsed.transactions)) throw new Error('Fichier JSON invalide.')
                setTransactions(parsed.transactions)
                setPrices(parsed.prices || {})
            } catch (err) {
                setError(err.message)
            }
        }
        reader.readAsText(file)
        event.target.value = ''
    }

    return (
        <div className="app-shell" data-theme={theme}>
            <header className="topbar">
                <div className="brand">
                    <div className="brand-mark" aria-hidden="true">
                        <BriefcaseBusiness size={18} />
                    </div>
                    <div>
                        <p className="eyebrow">Portfolio tracker</p>
                        <h1>Suivi de portefeuille</h1>
                    </div>
                </div>

                <div className="topbar-actions">
                    <button className="button secondary" type="button" onClick={handleExport}><Download size={16} />Exporter</button>
                    <label className="button secondary file-button">
                        <Upload size={16} />Importer
                        <input type="file" accept="application/json" onChange={handleImport} />
                    </label>
                    <button className="icon-button" type="button" aria-label="Changer de thème" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
                        {theme === 'dark' ? <SunMedium size={18} /> : <MoonStar size={18} />}
                    </button>
                </div>
            </header>

            {error && <div className="alert-error">{error}</div>}

            <main className="dashboard-grid">
                <section className="hero-grid">
                    <StatCard label="Valeur actuelle" value={snapshot.currentValue} delta={snapshot.totalPnL} percentage={snapshot.invested > 0 ? (snapshot.totalPnL / snapshot.invested) * 100 : 0} tone={snapshot.totalPnL >= 0 ? 'positive' : 'negative'} />
                    <StatCard label="Capital investi" value={snapshot.invested} />
                    <StatCard label="PV latente" value={snapshot.unrealizedPnL} delta={snapshot.unrealizedPnL} percentage={snapshot.invested > 0 ? (snapshot.unrealizedPnL / snapshot.invested) * 100 : 0} tone={snapshot.unrealizedPnL >= 0 ? 'positive' : 'negative'} />
                    <StatCard label="PV réalisée" value={snapshot.realizedPnL} delta={snapshot.realizedPnL} tone={snapshot.realizedPnL >= 0 ? 'positive' : 'negative'} />
                </section>

                <section className="main-column">
                    <PerformanceChart data={monthlySeries} />
                    <PositionsTable positions={snapshot.positions} onPriceChange={handlePriceChange} />
                    <HistoryList transactions={transactions} onDelete={handleDelete} />
                </section>

                <aside className="side-column">
                    <section className="panel note-panel">
                        <div className="panel-heading">
                            <div>
                                <p className="eyebrow">Vue d’ensemble</p>
                                <h2>État du portefeuille</h2>
                            </div>
                            <LineChart size={18} />
                        </div>
                        <dl className="summary-list">
                            <div><dt>Positions</dt><dd>{snapshot.positions.length}</dd></div>
                            <div><dt>Transactions</dt><dd>{snapshot.transactionCount}</dd></div>
                            <div><dt>Frais cumulés</dt><dd>{formatCurrency(snapshot.totalFees)}</dd></div>
                            <div><dt>Prix saisis</dt><dd>{Object.values(prices).filter((v) => v > 0).length}</dd></div>
                        </dl>
                    </section>
                    <AllocationCard positions={snapshot.positions} invested={snapshot.invested} />
                    <TransactionForm onSubmit={handleTransactionSubmit} />
                </aside>
            </main>
        </div>
    )
}