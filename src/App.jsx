import { useMemo, useState } from 'react'
import Tabs from './components/Tabs'
import KpiRow from './components/KpiRow'
import DashboardView from './components/DashboardView'
import PositionsView from './components/PositionsView'
import TransactionView from './components/TransactionView'
import HistoryView from './components/HistoryView'
import { usePersistentState } from './hooks/usePersistentState'
import { computePortfolio, uid } from './lib/portfolio'

const STORAGE_KEYS = {
    transactions: 'portfolio-tracker:transactions',
    prices: 'portfolio-tracker:prices',
}

export default function App() {
    const [currentTab, setCurrentTab] = useState('dashboard')
    const [transactions, setTransactions] = usePersistentState(STORAGE_KEYS.transactions, [])
    const [prices, setPrices] = usePersistentState(STORAGE_KEYS.prices, {})
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

    function handleAddTransaction(form) {
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
        setCurrentTab('history')
    }

    function handleDeleteTransaction(id) {
        setTransactions((current) => current.filter((tx) => tx.id !== id))
    }

    function handlePriceChange(ticker, value) {
        const parsed = Number(value)
        setPrices((current) => ({
            ...current,
            [ticker]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
        }))
    }

    function exportJSON() {
        const data = { transactions, prices, exportedAt: new Date().toISOString() }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `portefeuille-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
    }

    function importJSON(event) {
        const file = event.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(String(e.target?.result || '{}'))
                if (!Array.isArray(parsed.transactions)) throw new Error('Format JSON invalide.')
                setTransactions(parsed.transactions)
                setPrices(parsed.prices || {})
                setCurrentTab('dashboard')
            } catch (err) {
                setError(err.message)
            }
        }
        reader.readAsText(file)
        event.target.value = ''
    }

    return (
        <div className="container">
            <div className="header">
                <div>
                    <div className="header-title">Portefeuille</div>
                    <div className="header-name">Mon portefeuille</div>
                    <div className="header-date">Mis à jour le {new Date().toLocaleDateString('fr-FR')}</div>
                </div>
                <div className="header-actions">
                    <button className="btn-ghost" type="button" onClick={exportJSON}>Exporter</button>
                    <label className="btn-ghost" style={{ cursor: 'pointer' }}>
                        Importer
                        <input type="file" accept="application/json" style={{ display: 'none' }} onChange={importJSON} />
                    </label>
                </div>
            </div>

            <Tabs currentTab={currentTab} onChange={setCurrentTab} />

            {error ? <div className="card" style={{ color: 'var(--text-danger)' }}>{error}</div> : null}

            <div className={currentTab === 'dashboard' ? 'section active' : 'section'}>
                <KpiRow snapshot={snapshot} />
                <DashboardView snapshot={snapshot} />
            </div>

            <div className={currentTab === 'positions' ? 'section active' : 'section'}>
                <PositionsView positions={snapshot.positions} onPriceChange={handlePriceChange} />
            </div>

            <div className={currentTab === 'transaction' ? 'section active' : 'section'}>
                <TransactionView onAddTransaction={handleAddTransaction} />
            </div>

            <div className={currentTab === 'history' ? 'section active' : 'section'}>
                <HistoryView transactions={transactions} onDelete={handleDeleteTransaction} />
            </div>
        </div>
    )
}