import { useEffect, useMemo, useState } from 'react'
import Tabs from './components/Tabs'
import KpiRow from './components/KpiRow'
import DashboardView from './components/DashboardView'
import PositionsView from './components/PositionsView'
import TransactionView from './components/TransactionView'
import HistoryView from './components/HistoryView'
import { computePortfolio, validateTransaction } from './lib/portfolio'
import { exportPortfolioJSON, importPortfolioJSON } from './lib/storage'
import {
    getTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
} from './api/transactions'
import { getPrices, updatePrice } from './api/prices'

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
    const [transactions, setTransactions] = useState([])
    const [prices, setPrices] = useState({})
    const [loading, setLoading] = useState(true)
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true)
                const [transactionsData, pricesData] = await Promise.all([
                    getTransactions(),
                    getPrices()
                ])
                setTransactions(transactionsData)
                setPrices(pricesData)
                setError('')
            } catch (err) {
                setError(err.message || 'Impossible de charger les donnees.')
            } finally {
                setLoading(false)
            }
        }

        loadData()
    }, [])

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

    async function handleSaveTransaction(form) {
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
            type: form.type,
            ticker: form.ticker.trim().toUpperCase(),
            name: form.name?.trim() || form.ticker.trim().toUpperCase(),
            date: form.date,
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
            fees: Number(form.fees || 0),
            note: form.note?.trim() || '',
            currentPrice: form.currentPrice ? Number(form.currentPrice) : null,
        }

        try {
            if (form.currentPrice && form.currentPrice > 0) {
                const newPrice = Number(form.currentPrice)
                setPrices((current) => ({
                    ...current,
                    [payload.ticker]: newPrice,
                }))
                await updatePrice(payload.ticker, newPrice)
            }

            if (editingTransaction) {
                await updateTransaction(editingTransaction.id, payload)
                const refreshed = await getTransactions()
                setTransactions(refreshed)
            } else {
                const created = await createTransaction(payload)
                setTransactions((current) => [created, ...current])
            }

            setEditingTransaction(null)
            setError('')
            setCurrentTab('history')
        } catch (err) {
            setError(err.message || 'Erreur lors de l’enregistrement.')
            setCurrentTab('transaction')
        }
    }

    async function handleDeleteTransaction(id) {
        try {
            await deleteTransaction(id)

            if (editingTransaction?.id === id) {
                setEditingTransaction(null)
            }

            setTransactions((current) => current.filter((tx) => tx.id !== id))
            setError('')
        } catch (err) {
            setError(err.message || 'Erreur lors de la suppression.')
        }
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

    async function handlePriceChange(ticker, value) {
        const parsed = Number(value)
        const newPrice = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

        setPrices((current) => ({
            ...current,
            [ticker]: newPrice,
        }))

        try {
            await updatePrice(ticker, newPrice)
        } catch (err) {
            setError(err.message || 'Erreur lors de la mise a jour du prix.')
        }
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

            for (const [ticker, price] of Object.entries(data.prices)) {
                await updatePrice(ticker, price)
            }

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

            {loading ? (
                <div className="card">Chargement des transactions...</div>
            ) : null}

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