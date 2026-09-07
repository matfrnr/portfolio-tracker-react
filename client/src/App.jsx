import { useEffect, useMemo, useState, useCallback } from 'react'
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
import { getPrices, updatePrice, fetchLiveQuotes } from './api/prices'
import {
    Download,
    Upload,
    RefreshCw,
    CheckCircle,
    AlertCircle,
    X,
    TrendingUp,
    Briefcase,
} from 'lucide-react'

const EMPTY_SNAPSHOT = {
    positions: [],
    invested: 0,
    currentValue: 0,
    unrealizedPnL: 0,
    unrealizedPct: 0,
    realizedPnL: 0,
    totalPnL: 0,
    totalPnLPct: 0,
    totalFees: 0,
    transactionCount: 0,
    topPerformer: null,
    worstPerformer: null,
}

export default function App() {
    const [currentTab, setCurrentTab] = useState('dashboard')
    const [transactions, setTransactions] = useState([])
    const [prices, setPrices] = useState({})
    const [loading, setLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [lastRefreshTime, setLastRefreshTime] = useState('')
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [prefillData, setPrefillData] = useState(null)
    const [toast, setToast] = useState(null) // { message, type: 'success' | 'error' }

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type })
        setTimeout(() => {
            setToast((current) => (current?.message === message ? null : current))
        }, 4000)
    }, [])

    // Rafraîchir les cours en direct pour tous les tickers
    const refreshQuotesForTickers = useCallback(
        async (tickersList) => {
            if (!tickersList || tickersList.length === 0) return
            try {
                setIsRefreshing(true)
                const uniqueTickers = Array.from(
                    new Set(tickersList.map((t) => t.trim().toUpperCase())),
                ).filter(Boolean)

                if (uniqueTickers.length === 0) return

                const quotesMap = await fetchLiveQuotes(uniqueTickers)
                const newPrices = {}

                for (const [sym, data] of Object.entries(quotesMap)) {
                    if (data?.price) {
                        newPrices[sym] = data.price
                    }
                }

                if (Object.keys(newPrices).length > 0) {
                    setPrices((prev) => ({ ...prev, ...newPrices }))
                    const now = new Date()
                    setLastRefreshTime(
                        now.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                        }),
                    )
                }
            } catch (err) {
                console.warn('Erreur lors du rafraîchissement des cours:', err)
            } finally {
                setIsRefreshing(false)
            }
        },
        [],
    )

    // Chargement initial des données
    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true)
                const [transactionsData, pricesData] = await Promise.all([
                    getTransactions(),
                    getPrices(),
                ])
                setTransactions(transactionsData)
                setPrices(pricesData)

                // Rafraîchir immédiatement les cours des positions existantes
                const allTickers = transactionsData.map((tx) => tx.ticker)
                if (allTickers.length > 0) {
                    refreshQuotesForTickers(allTickers)
                }
            } catch (err) {
                showToast(err.message || 'Impossible de charger les données.', 'error')
            } finally {
                setLoading(false)
            }
        }

        loadData()
    }, [refreshQuotesForTickers, showToast])

    // Calcul du portefeuille
    const snapshot = useMemo(() => {
        try {
            return computePortfolio(transactions, prices)
        } catch (err) {
            console.error('Erreur calcul portefeuille:', err)
            return {
                ...EMPTY_SNAPSHOT,
                transactionCount: transactions.length,
            }
        }
    }, [transactions, prices])

    // Bouton de rafraîchissement global
    async function handleManualRefresh() {
        const allTickers = Array.from(new Set(transactions.map((tx) => tx.ticker)))
        if (allTickers.length === 0) {
            showToast('Aucun ticker à actualiser pour le moment.', 'success')
            return
        }
        await refreshQuotesForTickers(allTickers)
        showToast('Cours de bourse actualisés avec succès !', 'success')
    }

    // Sauvegarde (Création / Édition)
    async function handleSaveTransaction(form) {
        const validationError = validateTransaction(
            form,
            transactions,
            editingTransaction ? editingTransaction.id : null,
        )

        if (validationError) {
            showToast(validationError, 'error')
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
        }

        try {
            if (form.currentPrice && Number(form.currentPrice) > 0) {
                const newPrice = Number(form.currentPrice)
                setPrices((curr) => ({ ...curr, [payload.ticker]: newPrice }))
                await updatePrice(payload.ticker, newPrice)
            }

            if (editingTransaction) {
                await updateTransaction(editingTransaction.id, payload)
                const refreshed = await getTransactions()
                setTransactions(refreshed)
                showToast('Transaction modifiée avec succès !', 'success')
            } else {
                const created = await createTransaction(payload)
                setTransactions((curr) => [created, ...curr])
                showToast('Transaction enregistrée avec succès !', 'success')
            }

            // Mettre à jour les cours
            refreshQuotesForTickers([payload.ticker])

            setEditingTransaction(null)
            setPrefillData(null)
            setCurrentTab('positions')
        } catch (err) {
            showToast(err.message || "Erreur lors de l'enregistrement.", 'error')
        }
    }

    // Suppression
    async function handleDeleteTransaction(id) {
        try {
            await deleteTransaction(id)
            if (editingTransaction?.id === id) {
                setEditingTransaction(null)
            }
            setTransactions((curr) => curr.filter((tx) => tx.id !== id))
            showToast('Transaction supprimée.', 'success')
        } catch (err) {
            showToast(err.message || 'Erreur lors de la suppression.', 'error')
        }
    }

    // Modification
    function handleEditTransaction(transaction) {
        setEditingTransaction(transaction)
        setPrefillData(null)
        setCurrentTab('transaction')
    }

    function handleCancelEdit() {
        setEditingTransaction(null)
        setPrefillData(null)
    }

    // Action rapide depuis les positions (Achat / Vente préremplis)
    function handleQuickAction(type, data) {
        setEditingTransaction(null)
        setPrefillData({
            type,
            ticker: data.ticker,
            name: data.name,
            currentPrice: data.currentPrice,
        })
        setCurrentTab('transaction')
    }

    // Changement manuel de cours dans le tableau
    async function handlePriceChange(ticker, newPrice) {
        setPrices((curr) => ({
            ...curr,
            [ticker]: newPrice,
        }))

        try {
            await updatePrice(ticker, newPrice)
            showToast(`Cours de ${ticker} mis à jour : ${newPrice} €`, 'success')
        } catch (err) {
            showToast(err.message || 'Erreur lors de la mise à jour du cours.', 'error')
        }
    }

    // Exportation
    function handleExport() {
        try {
            exportPortfolioJSON({ transactions, prices })
            showToast('Fichier de portefeuille exporté avec succès !', 'success')
        } catch (err) {
            showToast("Erreur lors de l'exportation.", 'error')
        }
    }

    // Importation
    async function handleImport(event) {
        const file = event.target.files?.[0]
        if (!file) return

        try {
            const data = await importPortfolioJSON(file)
            setTransactions(data.transactions)
            setPrices(data.prices)

            // Sauvegarder les prix importés en base
            for (const [ticker, price] of Object.entries(data.prices)) {
                await updatePrice(ticker, price)
            }

            setEditingTransaction(null)
            setPrefillData(null)
            showToast(`${data.transactions.length} transactions importées avec succès !`, 'success')
            setCurrentTab('dashboard')

            // Actualiser les cours
            const allTickers = data.transactions.map((tx) => tx.ticker)
            refreshQuotesForTickers(allTickers)
        } catch (err) {
            showToast(err.message || "Fichier d'importation invalide.", 'error')
        } finally {
            event.target.value = ''
        }
    }

    return (
        <div className="app-layout">
            {/* Header principal */}
            <header className="app-header">
                <div className="header-container">
                    <div className="brand-group">
                        <div className="brand-icon">
                            <Briefcase size={22} />
                        </div>
                        <div>
                            <div className="brand-title">Portfolio Tracker</div>
                            <div className="brand-subtitle">
                                Gestion & suivi de performance d'actifs boursiers
                            </div>
                        </div>
                    </div>

                    <div className="header-controls">
                        <button
                            type="button"
                            className="btn-header-action"
                            onClick={handleManualRefresh}
                            disabled={isRefreshing}
                            title="Actualiser tous les cours en direct"
                        >
                            <RefreshCw size={15} className={isRefreshing ? 'spin-icon' : ''} />
                            <span>{isRefreshing ? 'Actualisation...' : 'Actualiser les cours'}</span>
                        </button>

                        <button
                            type="button"
                            className="btn-header-action"
                            onClick={handleExport}
                            title="Exporter en JSON"
                        >
                            <Download size={15} />
                            <span>Exporter</span>
                        </button>

                        <label className="btn-header-action import-label" title="Importer depuis un fichier JSON">
                            <Upload size={15} />
                            <span>Importer</span>
                            <input
                                type="file"
                                accept="application/json"
                                style={{ display: 'none' }}
                                onChange={handleImport}
                            />
                        </label>
                    </div>
                </div>
            </header>

            {/* Notification Toast */}
            {toast && (
                <div className={`toast-notification ${toast.type}`}>
                    {toast.type === 'error' ? (
                        <AlertCircle size={18} className="toast-icon" />
                    ) : (
                        <CheckCircle size={18} className="toast-icon" />
                    )}
                    <span className="toast-message">{toast.message}</span>
                    <button
                        type="button"
                        className="toast-close"
                        onClick={() => setToast(null)}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Corps de l'application */}
            <main className="main-content">
                {/* Navigation par Onglets */}
                <Tabs
                    currentTab={currentTab}
                    onChange={setCurrentTab}
                    positionsCount={snapshot.positions.length}
                    transactionsCount={transactions.length}
                />

                {loading ? (
                    <div className="card loading-card">
                        <RefreshCw size={24} className="spin-icon text-accent" />
                        <p>Chargement de votre portefeuille...</p>
                    </div>
                ) : (
                    <>
                        {/* Vue 1 : Tableau de bord */}
                        <div className={currentTab === 'dashboard' ? 'tab-view active' : 'tab-view'}>
                            <KpiRow snapshot={snapshot} />
                            <DashboardView snapshot={snapshot} />
                        </div>

                        {/* Vue 2 : Positions */}
                        <div className={currentTab === 'positions' ? 'tab-view active' : 'tab-view'}>
                            <PositionsView
                                positions={snapshot.positions}
                                onPriceChange={handlePriceChange}
                                onRefreshLivePrices={handleManualRefresh}
                                isRefreshing={isRefreshing}
                                lastRefreshTime={lastRefreshTime}
                                onQuickAction={handleQuickAction}
                            />
                        </div>

                        {/* Vue 3 : Nouvelle transaction / Modification */}
                        <div className={currentTab === 'transaction' ? 'tab-view active' : 'tab-view'}>
                            <TransactionView
                                onSaveTransaction={handleSaveTransaction}
                                editingTransaction={editingTransaction}
                                onCancelEdit={handleCancelEdit}
                                prefillData={prefillData}
                                transactions={transactions}
                                currentPrice={
                                    editingTransaction
                                        ? prices[editingTransaction.ticker] || ''
                                        : prefillData?.currentPrice || ''
                                }
                            />
                        </div>

                        {/* Vue 4 : Historique */}
                        <div className={currentTab === 'history' ? 'tab-view active' : 'tab-view'}>
                            <HistoryView
                                transactions={transactions}
                                onDelete={handleDeleteTransaction}
                                onEdit={handleEditTransaction}
                            />
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}