import { useEffect, useMemo, useState, useCallback } from 'react'
import Tabs from './components/Tabs'
import KpiRow from './components/KpiRow'
import DashboardView from './components/DashboardView'
import PositionsView from './components/PositionsView'
import TransactionView from './components/TransactionView'
import HistoryView from './components/HistoryView'
import { computePortfolio, validateTransaction, uid, parseNumber } from './lib/portfolio'
import { exportPortfolioJSON, importPortfolioJSON } from './lib/storage'
import {
    getTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    bulkImportTransactions,
} from './api/transactions'
import { getPrices, updatePrice, fetchLiveQuotes, getForexRate } from './api/prices'
import {
    Download,
    Upload,
    RefreshCw,
    CheckCircle,
    AlertCircle,
    X,
    WifiOff,
    Briefcase,
} from 'lucide-react'

const STORAGE_KEYS = {
    transactions: 'portfolio-tracker:transactions',
    prices: 'portfolio-tracker:prices',
}

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

    // Initialisation immédiate depuis le stockage local (cache de secours permanent)
    const [transactions, setTransactions] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.transactions)
            return raw ? JSON.parse(raw) : []
        } catch {
            return []
        }
    })

    const [prices, setPrices] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.prices)
            return raw ? JSON.parse(raw) : {}
        } catch {
            return {}
        }
    })

    // Devise native par ticker (ex: { AAPL: 'USD', LVMH: 'EUR' })
    const [currencies, setCurrencies] = useState({})
    // Taux de change EUR/USD en temps réel (fallback : 1.085)
    const [forexRate, setForexRate] = useState(1.085)

    const [loading, setLoading] = useState(true)
    const [isOffline, setIsOffline] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [lastRefreshTime, setLastRefreshTime] = useState('')
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [prefillData, setPrefillData] = useState(null)
    const [toast, setToast] = useState(null) // { message, type: 'success' | 'error' }

    // Sauvegarde continue dans le localStorage en double sécurité
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions))
        } catch (e) {
            // no-op
        }
    }, [transactions])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.prices, JSON.stringify(prices))
        } catch (e) {
            // no-op
        }
    }, [prices])

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
                const newCurrencies = {}

                for (const [sym, data] of Object.entries(quotesMap)) {
                    if (data?.price && Number(data.price) > 0) {
                        newPrices[sym] = Number(data.price)
                    }
                    // Mettre à jour la devise détectée par Yahoo Finance
                    if (data?.currency) {
                        newCurrencies[sym] = data.currency
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
                if (Object.keys(newCurrencies).length > 0) {
                    setCurrencies((prev) => ({ ...prev, ...newCurrencies }))
                }
            } catch (err) {
                console.warn('Erreur lors du rafraîchissement des cours:', err)
            } finally {
                setIsRefreshing(false)
            }
        },
        [],
    )

    // Chargement initial des données depuis le serveur
    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true)
                const [transactionsData, pricesRes, forexRes] = await Promise.all([
                    getTransactions(),
                    getPrices(),
                    getForexRate().catch(() => null),
                ])

                if (Array.isArray(transactionsData)) {
                    setTransactions(transactionsData)
                    setIsOffline(false)
                }

                // getPrices retourne { prices: {...}, currencies: {...} } OU directement un objet de prix
                if (pricesRes && typeof pricesRes === 'object') {
                    if (pricesRes.prices) {
                        setPrices((prev) => ({ ...prev, ...pricesRes.prices }))
                    } else {
                        // Compatibilité ancienne version
                        setPrices((prev) => ({ ...prev, ...pricesRes }))
                    }
                    if (pricesRes.currencies) {
                        setCurrencies((prev) => ({ ...prev, ...pricesRes.currencies }))
                    }
                }

                // Taux de change EUR/USD
                if (forexRes?.EURUSD && Number(forexRes.EURUSD) > 0) {
                    setForexRate(Number(forexRes.EURUSD))
                }

                // Rafraîchir les cours des positions existantes
                const allTickers = (transactionsData || []).map((tx) => tx.ticker)
                if (allTickers.length > 0) {
                    refreshQuotesForTickers(allTickers)
                }
            } catch (err) {
                console.warn('Serveur API inaccessible, bascule sur les données locales persistantes :', err)
                setIsOffline(true)
                showToast('Serveur API inaccessible : affichage des données locales sauvegardées.', 'error')
            } finally {
                setLoading(false)
            }
        }

        loadData()
    }, [refreshQuotesForTickers, showToast])

    // Calcul du portefeuille (tout consolidé en EUR)
    const snapshot = useMemo(() => {
        try {
            return computePortfolio(transactions, prices, currencies, forexRate)
        } catch (err) {
            console.error('Erreur calcul portefeuille:', err)
            return {
                ...EMPTY_SNAPSHOT,
                transactionCount: transactions.length,
            }
        }
    }, [transactions, prices, currencies, forexRate])

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
            quantity: parseNumber(form.quantity, 0),
            unitPrice: parseNumber(form.unitPrice, 0),
            fees: parseNumber(form.fees, 0),
            note: form.note?.trim() || '',
        }

        try {
            if (form.currentPrice && parseNumber(form.currentPrice, 0) > 0) {
                const newPrice = parseNumber(form.currentPrice, 0)
                setPrices((curr) => ({ ...curr, [payload.ticker]: newPrice }))
                try {
                    await updatePrice(payload.ticker, newPrice)
                } catch {
                    // Sauvegarde locale appliquée
                }
            }

            if (editingTransaction) {
                try {
                    await updateTransaction(editingTransaction.id, payload)
                    const refreshed = await getTransactions()
                    setTransactions(refreshed)
                } catch (e) {
                    // Fallback local si serveur déconnecté
                    setTransactions((curr) =>
                        curr.map((tx) => (tx.id === editingTransaction.id ? { ...tx, ...payload } : tx)),
                    )
                }
                showToast('Transaction modifiée avec succès !', 'success')
            } else {
                try {
                    const created = await createTransaction(payload)
                    setTransactions((curr) => [created, ...curr])
                } catch (e) {
                    // Fallback local si serveur déconnecté
                    const localTx = { ...payload, id: uid(), createdAt: new Date().toISOString() }
                    setTransactions((curr) => [localTx, ...curr])
                }
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
            showToast('Transaction supprimée avec succès !', 'success')
        } catch (err) {
            console.error('Erreur lors de la suppression serveur:', err)
            showToast(err.message || 'Impossible de supprimer la transaction sur le serveur.', 'error')
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
        const cleanPrice = parseNumber(newPrice, 0)
        setPrices((curr) => ({
            ...curr,
            [ticker]: cleanPrice,
        }))

        try {
            await updatePrice(ticker, cleanPrice)
            showToast(`Cours de ${ticker} mis à jour : ${cleanPrice} €`, 'success')
        } catch (err) {
            showToast(`Cours de ${ticker} mis à jour localement : ${cleanPrice} €`, 'success')
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

    // Importation avec sauvegarde PERMANENTE (serveur + SQLite + JSON + localStorage)
    async function handleImport(event) {
        const file = event.target.files?.[0]
        if (!file) return

        try {
            const data = await importPortfolioJSON(file)
            if (!Array.isArray(data.transactions)) {
                throw new Error("Format JSON invalide : 'transactions' manquant.")
            }

            // 1. Mise à jour immédiate de l'écran et du cache local
            setTransactions(data.transactions)
            if (data.prices) {
                setPrices((prev) => ({ ...prev, ...data.prices }))
            }

            // 2. Sauvegarde permanente complète sur le serveur (SQLite + portfolio-data.json)
            try {
                const bulkRes = await bulkImportTransactions(data.transactions, data.prices || {})
                if (bulkRes?.transactions && Array.isArray(bulkRes.transactions)) {
                    setTransactions(bulkRes.transactions)
                }
            } catch (backendErr) {
                console.warn('Sauvegarde serveur différée (serveur hors-ligne) :', backendErr)
            }

            setEditingTransaction(null)
            setPrefillData(null)
            showToast(`${data.transactions.length} transactions importées et enregistrées de façon permanente !`, 'success')
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
                       <a onClick={() => setCurrentTab('dashboard')}>
                         <div className="brand-icon">
                            <Briefcase size={22} />
                        </div>
                       </a>
                        <div>
                            <div className="brand-title">Portfolio Tracker</div>
                            <div className="brand-subtitle">
                                Gestion & suivi de performance d'actifs boursiers
                            </div>
                        </div>
                    </div>

                    <div className="header-controls">
                        {isOffline && (
                            <span className="badge badge-sell" title="Le serveur API est inaccessible. Vos données restent conservées en local.">
                                <WifiOff size={13} /> Mode local permanent
                            </span>
                        )}

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
                                forexRate={forexRate}
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
                                forexRate={forexRate}
                            />
                        </div>

                        {/* Vue 4 : Historique */}
                        <div className={currentTab === 'history' ? 'tab-view active' : 'tab-view'}>
                            <HistoryView
                                transactions={transactions}
                                onDelete={handleDeleteTransaction}
                                onEdit={handleEditTransaction}
                                forexRate={forexRate}
                            />
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}