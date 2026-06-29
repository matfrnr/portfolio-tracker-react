import { useMemo, useState } from 'react'
import Tabs from './components/Tabs'
import KpiRow from './components/KpiRow'
import DashboardView from './components/DashboardView'
import PositionsView from './components/PositionsView'
import TransactionView from './components/TransactionView'
import HistoryView from './components/HistoryView'
import { usePersistentState } from './hooks/usePersistentState'
import { computePortfolio, uid, validateTransaction } from './lib/portfolio'
import { exportPortfolioJSON, importPortfolioJSON } from './lib/storage'

const STORAGE_KEYS = {
    transactions: 'portfolio-tracker:transactions',
    prices: 'portfolio-tracker:prices',
}

const EMPTY_SNAPSHOT = {
    positions: [],
    invested: 0,
    currentValue: 0,
    unrealizedPnL: 0,
    realizedPnL: 0,
    totalPnL: 0,
    totalFees: 0,
    transactionCount: 0,
}

export default function App() {
    const [currentTab, setCurrentTab] = useState('dashboard')
    const [transactions, setTransactions] = usePersistentState(STORAGE_KEYS.transactions, [])
    const [prices, setPrices] = usePersistentState(STORAGE_KEYS.prices, {})
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [error, setError] = useState('')

    const snapshot = useMemo(() => {
        try {
            return computePortfolio(transactions, prices)
        } catch (err) {
            return {
                ...EMPTY_SNAPSHOT,
                transactionCount: transactions.length,
            }
        }
    }, [transactions, prices])

    function handleSaveTransaction(form) {
        const baseTransactions = editingTransaction
            ? transactions.filter((tx) => tx.id !== editingTransaction.id)
            : transactions

        const validationError = validateTransaction(form, baseTransactions)

        if (validationError) {
            setError(validationError)
            setCurrentTab('transaction')
            return
        }

        const payload = {
            id: editingTransaction ? editingTransaction.id : uid(),
            type: form.type,
            ticker: form.ticker.trim().toUpperCase(),
            name: form.name?.trim() || form.ticker.trim().toUpperCase(),
            date: form.date,
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
            fees: Number(form.fees || 0),
            note: form.note?.trim() || '',
        }

        if (form.currentPrice && form.currentPrice > 0) {
            setPrices((current) => ({
                ...current,
                [payload.ticker]: Number(form.currentPrice),
            }))
        }

        setTransactions((current) =>
            editingTransaction
                ? current.map((tx) => (tx.id === editingTransaction.id ? payload : tx))
                : [payload, ...current]
        )

        setEditingTransaction(null)
        setError('')
        setCurrentTab('history')
    }

    function handleDeleteTransaction(id) {
        if (editingTransaction?.id === id) {
            setEditingTransaction(null)
        }

        setTransactions((current) => current.filter((tx) => tx.id !== id))
    }

    function handleEditTransaction(transaction) {
        setEditingTransaction(transaction)
        setError('')
        setCurrentTab('transaction')
    }

    function handleCancelEdit() {
        setEditingTransaction(null)
        setError('')
    }

    function handlePriceChange(ticker, value) {
        const parsed = Number(value)

        setPrices((current) => ({
            ...current,
            [ticker]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
        }))
    }

    function handleExport() {
        exportPortfolioJSON({ transactions, prices })
    }

    async function handleImport(event) {
        const file = event.target.files?.[0]
        if (!file) return

        try {
            const data = await importPortfolioJSON(file)
            setTransactions(data.transactions)
            setPrices(data.prices)
            setEditingTransaction(null)
            setError('')
            setCurrentTab('dashboard')
        } catch (err) {
            setError(err.message)
        } finally {
            event.target.value = ''
        }
    }

    return (
        <div className="container">
            <div className="header">
                <div>
                    <div className="header-title">Portefeuille</div>
                    <div className="header-name">Mon portefeuille</div>
                    <div className="header-date">
                        Mis à jour le {new Date().toLocaleDateString('fr-FR')}
                    </div>
                </div>

                <div className="header-actions">
                    <button className="btn-ghost" type="button" onClick={handleExport}>
                        Exporter
                    </button>

                    <label className="btn-ghost" style={{ cursor: 'pointer' }}>
                        Importer
                        <input
                            type="file"
                            accept="application/json"
                            style={{ display: 'none' }}
                            onChange={handleImport}
                        />
                    </label>
                </div>
            </div>

            <Tabs currentTab={currentTab} onChange={setCurrentTab} />

            {error ? (
                <div className="card" style={{ color: 'var(--text-danger)' }}>
                    {error}
                </div>
            ) : null}

            <div className={currentTab === 'dashboard' ? 'section active' : 'section'}>
                <KpiRow snapshot={snapshot} />
                <DashboardView snapshot={snapshot} />
            </div>

            <div className={currentTab === 'positions' ? 'section active' : 'section'}>
                <PositionsView
                    positions={snapshot.positions}
                    onPriceChange={handlePriceChange}
                />
            </div>

            <div className={currentTab === 'transaction' ? 'section active' : 'section'}>
                <TransactionView
                    onSaveTransaction={handleSaveTransaction}
                    editingTransaction={editingTransaction}
                    onCancelEdit={handleCancelEdit}
                    currentPrice={editingTransaction ? prices[editingTransaction.ticker] || '' : ''}
                />
            </div>

            <div className={currentTab === 'history' ? 'section active' : 'section'}>
                <HistoryView
                    transactions={transactions}
                    onDelete={handleDeleteTransaction}
                    onEdit={handleEditTransaction}
                />
            </div>
        </div>
    )
}