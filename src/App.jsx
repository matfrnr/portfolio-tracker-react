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

function validateTransaction(form, transactions) {
    if (!form.ticker?.trim()) return 'Le ticker est obligatoire.'
    if (!form.date) return 'La date est obligatoire.'
    if (!Number.isFinite(form.quantity) || form.quantity <= 0) {
        return 'La quantité doit être supérieure à 0.'
    }
    if (!Number.isFinite(form.unitPrice) || form.unitPrice <= 0) {
        return 'Le prix unitaire doit être supérieur à 0.'
    }
    if (!Number.isFinite(form.fees) || form.fees < 0) {
        return 'Les frais ne peuvent pas être négatifs.'
    }

    if (form.type === 'SELL') {
        const ticker = form.ticker.trim().toUpperCase()

        const bought = transactions
            .filter((tx) => tx.ticker === ticker && tx.type === 'BUY')
            .reduce((sum, tx) => sum + Number(tx.quantity), 0)

        const sold = transactions
            .filter((tx) => tx.ticker === ticker && tx.type === 'SELL')
            .reduce((sum, tx) => sum + Number(tx.quantity), 0)

        const available = bought - sold

        if (form.quantity > available) {
            return `Vente impossible : tu détiens ${available} ${ticker}.`
        }
    }

    return null
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

    function exportJSON() {
        const data = { transactions, prices, exportedAt: new Date().toISOString() }
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json',
        })
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
                if (!Array.isArray(parsed.transactions)) {
                    throw new Error('Format JSON invalide.')
                }
                setTransactions(parsed.transactions)
                setPrices(parsed.prices || {})
                setEditingTransaction(null)
                setError('')
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
                    <div className="header-date">
                        Mis à jour le {new Date().toLocaleDateString('fr-FR')}
                    </div>
                </div>

                <div className="header-actions">
                    <button className="btn-ghost" type="button" onClick={exportJSON}>
                        Exporter
                    </button>
                    <label className="btn-ghost" style={{ cursor: 'pointer' }}>
                        Importer
                        <input
                            type="file"
                            accept="application/json"
                            style={{ display: 'none' }}
                            onChange={importJSON}
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