import { useEffect, useMemo, useState, useCallback } from 'react'
import Tabs from './components/Tabs'
import KpiRow from './components/KpiRow'
import DashboardView from './components/DashboardView'
import PositionsView from './components/PositionsView'
import TransactionView from './components/TransactionView'
import HistoryView from './components/HistoryView'
import { computePortfolio, validateTransaction, validateTransactionHistory, uid, parseNumber, formatCurrency, formatDateFR, formatQty, defaultCurrencyForTicker } from './lib/portfolio'
import { exportPortfolioJSON, importPortfolioJSON } from './lib/storage'
import { parsePortfolioCSV, downloadPortfolioCSVTemplate } from './lib/portfolioCsv'
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
    FileSpreadsheet,
} from 'lucide-react'

const STORAGE_KEYS = {
    transactions: 'portfolio-tracker:transactions',
    prices: 'portfolio-tracker:prices',
    currencies: 'portfolio-tracker:currencies',
    forex: 'portfolio-tracker:forex',
    pendingSync: 'portfolio-tracker:pending-sync',
    assetMetadata: 'portfolio-tracker:asset-metadata',
    tagCatalog: 'portfolio-tracker:tag-catalog',
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
    dividendsGross: 0,
    dividendsNet: 0,
    totalBought: 0,
    totalSold: 0,
    totalFees: 0,
    transactionCount: 0,
    dataIssues: [],
    dataWarnings: [],
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
    const [currencies, setCurrencies] = useState(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.currencies) || '{}') } catch { return {} }
    })
    const [assetMetadata, setAssetMetadata] = useState(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.assetMetadata) || '{}') } catch { return {} }
    })
    const [tagCatalog, setTagCatalog] = useState(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.tagCatalog) || '["Action","ETF","PEA","CTO"]') } catch { return ['Action', 'ETF', 'PEA', 'CTO'] }
    })
    // Taux de change EUR/USD en temps réel (fallback : 1.085)
    const [forexRate, setForexRate] = useState(() => {
        try {
            const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.forex) || '{}')
            return Number(cached.USD || cached.EURUSD) || 1.085
        } catch { return 1.085 }
    })
    const [forexRates, setForexRates] = useState(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.forex) || '{"EUR":1,"USD":1.085}') } catch { return { EUR: 1, USD: 1.085 } }
    })

    const [loading, setLoading] = useState(true)
    const [isOffline, setIsOffline] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [lastRefreshTime, setLastRefreshTime] = useState('')
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [prefillData, setPrefillData] = useState(null)
    const [toast, setToast] = useState(null) // { message, type: 'success' | 'error' }
    const [pendingSync, setPendingSync] = useState(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.pendingSync) || '[]') } catch { return [] }
    })
    const [importPreview, setImportPreview] = useState(null)
    const [importMode, setImportMode] = useState('append')
    const [importError, setImportError] = useState('')

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

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEYS.currencies, JSON.stringify(currencies)) } catch {}
    }, [currencies])

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEYS.assetMetadata, JSON.stringify(assetMetadata)) } catch {}
    }, [assetMetadata])
    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEYS.tagCatalog, JSON.stringify(tagCatalog)) } catch {}
    }, [tagCatalog])

    function updateAssetMetadata(ticker, updates) {
        const symbol = String(ticker || '').trim().toUpperCase()
        if (!symbol) return
        setAssetMetadata((current) => ({
            ...current,
            [symbol]: { ...(current[symbol] || {}), ...updates },
        }))
    }

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEYS.forex, JSON.stringify(forexRates)) } catch {}
    }, [forexRates])

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEYS.pendingSync, JSON.stringify(pendingSync)) } catch {}
    }, [pendingSync])

    function queuePendingSync(operation) {
        setPendingSync((current) => [...current, operation])
    }

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type })
        setTimeout(() => {
            setToast((current) => (current?.message === message ? null : current))
        }, 4000)
    }, [])

    // Rafraîchir les cours en direct pour tous les tickers
    const refreshQuotesForTickers = useCallback(
        async (tickersList) => {
            if (!tickersList || tickersList.length === 0) return 0
            try {
                setIsRefreshing(true)
                const uniqueTickers = Array.from(
                    new Set(tickersList.map((t) => t.trim().toUpperCase())),
                ).filter(Boolean)

                if (uniqueTickers.length === 0) return 0

                const quotesMap = await fetchLiveQuotes(uniqueTickers)
                const newPrices = {}
                const newCurrencies = {}

                for (const [sym, data] of Object.entries(quotesMap)) {
                    if (!data?.isFallback && data?.price && Number(data.price) > 0) {
                        newPrices[sym] = Number(data.price)
                        // Seules les cotations fraîchement reçues remplacent le cache local.
                        if (data?.currency) newCurrencies[sym] = data.currency
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
                    try {
                        const rateRes = await getForexRate(Object.values(newCurrencies))
                        if (rateRes?.rates) setForexRates((prev) => ({ ...prev, ...rateRes.rates, EUR: 1 }))
                        if (Number(rateRes?.EURUSD) > 0) setForexRate(Number(rateRes.EURUSD))
                    } catch {
                        // Le portefeuille conserve ses taux enregistrés si le service de change est indisponible.
                    }
                }
                return Object.keys(newPrices).length
            } catch (err) {
                console.warn('Erreur lors du rafraîchissement des cours:', err)
                return 0
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
                let [transactionsData, pricesRes, forexRes] = await Promise.all([
                    getTransactions(),
                    getPrices(),
                    getForexRate().catch(() => null),
                ])

                let queuedOperations = []
                try {
                    const savedOperations = JSON.parse(localStorage.getItem(STORAGE_KEYS.pendingSync) || '[]')
                    if (Array.isArray(savedOperations)) queuedOperations = savedOperations
                } catch {}
                for (const operation of queuedOperations) {
                    if (operation.kind === 'upsert') {
                        await bulkImportTransactions([operation.transaction])
                    } else if (operation.kind === 'delete') {
                        try { await deleteTransaction(operation.id) } catch (error) { if (error.status !== 404) throw error }
                    } else if (operation.kind === 'bulk') {
                        await bulkImportTransactions(operation.transactions, operation.prices, operation.currencies, operation.replace, operation.replacePrices)
                    }
                }
                if (queuedOperations.length) {
                    ;[transactionsData, pricesRes] = await Promise.all([getTransactions(), getPrices()])
                    setPendingSync([])
                    showToast(`${queuedOperations.length} modification${queuedOperations.length > 1 ? 's' : ''} locale${queuedOperations.length > 1 ? 's' : ''} synchronisée${queuedOperations.length > 1 ? 's' : ''}.`, 'success')
                }

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
                if (forexRes?.rates) setForexRates((prev) => ({ ...prev, ...forexRes.rates, EUR: 1 }))
                else if (Number(forexRes?.EURUSD) > 0) setForexRates((prev) => ({ ...prev, EUR: 1, USD: Number(forexRes.EURUSD) }))

                // Rafraîchir les cours des positions existantes
                const allTickers = (transactionsData || []).map((tx) => tx.ticker).filter(Boolean)
                if (allTickers.length > 0) {
                    refreshQuotesForTickers(allTickers)
                }
            } catch (err) {
                console.warn('Serveur API inaccessible, bascule sur les données locales persistantes :', err)
                setIsOffline(!err.status)
                showToast(
                    err.status
                        ? `Synchronisation suspendue : ${err.message}`
                        : 'Serveur API inaccessible : affichage des données locales sauvegardées.',
                    'error',
                )
            } finally {
                setLoading(false)
            }
        }

        loadData()
    }, [refreshQuotesForTickers, showToast])

    // Calcul du portefeuille (tout consolidé en EUR)
    const snapshot = useMemo(() => {
        try {
            const base = computePortfolio(transactions, prices, currencies, forexRates)
            const positions = base.positions.map((position) => {
                const override = Number(assetMetadata[position.ticker]?.pruOverride)
                if (!(override > 0) || Math.abs(override - position.averageCost) < 1e-9) return position
                const costBasisNative = override * position.quantity
                const nativeToEUR = position.costBasisNative > 0 ? position.costBasis / position.costBasisNative : 1
                const costBasis = costBasisNative * nativeToEUR
                const unrealizedPnL = position.marketValue - costBasis
                const unrealizedPnLNative = position.marketValueNative - costBasisNative
                return { ...position, averageCost: override, costBasisNative, costBasis, averageCostEUR: costBasis / position.quantity, unrealizedPnL, unrealizedPnLNative, unrealizedPct: costBasis > 0 ? unrealizedPnL / costBasis * 100 : 0, unrealizedPctNative: costBasisNative > 0 ? unrealizedPnLNative / costBasisNative * 100 : 0 }
            })
            const invested = positions.reduce((sum, position) => sum + position.costBasis, 0)
            const unrealizedPnL = base.currentValue - invested
            const ranked = [...positions].sort((a, b) => b.unrealizedPct - a.unrealizedPct)
            return { ...base, positions, invested, unrealizedPnL, unrealizedPct: invested > 0 ? unrealizedPnL / invested * 100 : 0, totalPnL: unrealizedPnL + base.realizedPnL + base.dividendsNet, topPerformer: ranked[0] || null, worstPerformer: ranked[ranked.length - 1] || null }
        } catch (err) {
            console.error('Erreur calcul portefeuille:', err)
            return {
                ...EMPTY_SNAPSHOT,
                transactionCount: transactions.length,
            }
        }
    }, [transactions, prices, currencies, forexRates, assetMetadata])

    const importHistoryIssues = useMemo(() => {
        if (!importPreview) return []
        const incoming = importPreview.transactions.map((tx, index) => ({ ...tx, id: tx.id || `preview-${index}` }))
        const merged = importMode === 'replace'
            ? incoming
            : [...new Map([...transactions, ...incoming].map((tx, index) => [tx.id || `row-${index}`, tx])).values()]
        return validateTransactionHistory(merged)
    }, [importPreview, importMode, transactions])

    const missingImportRates = useMemo(
        () => importPreview?.transactions.filter((tx) => {
            const currency = tx.currency || defaultCurrencyForTicker(tx.ticker)
            return currency !== 'EUR' && (!(Number(tx.exchangeRate) > 0) || (currency === 'USD' && Number(tx.exchangeRate) === 1))
        }).length || 0,
        [importPreview],
    )

    // Bouton de rafraîchissement global
    async function handleManualRefresh() {
        const allTickers = Array.from(new Set(transactions.map((tx) => tx.ticker)))
        if (allTickers.length === 0) {
            showToast('Aucun ticker à actualiser pour le moment.', 'success')
            return
        }
        const refreshedCount = await refreshQuotesForTickers(allTickers)
        showToast(
            refreshedCount > 0
                ? `${refreshedCount} cours actualisé${refreshedCount > 1 ? 's' : ''}.`
                : 'Aucun cours récupéré. Les derniers cours enregistrés restent affichés.',
            refreshedCount > 0 ? 'success' : 'error',
        )
    }

    // Sauvegarde (Création / Édition)
    async function handleSaveTransaction(form) {
        const validationError = validateTransaction(
            { ...form, id: editingTransaction?.id, createdAt: editingTransaction?.createdAt },
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
            quantity: form.type === 'DIVIDEND' ? 1 : parseNumber(form.quantity, 0),
            unitPrice: parseNumber(form.unitPrice, 0),
            fees: parseNumber(form.fees, 0),
            currency: form.currency || 'EUR',
            exchangeRate: form.currency === 'EUR' ? 1 : parseNumber(form.exchangeRate, forexRates[form.currency] || forexRate),
            note: form.note?.trim() || '',
        }

        let savedLocally = false
        try {
            if (form.currentPrice && parseNumber(form.currentPrice, 0) > 0) {
                const newPrice = parseNumber(form.currentPrice, 0)
                setPrices((curr) => ({ ...curr, [payload.ticker]: newPrice }))
                try {
                    await updatePrice(payload.ticker, newPrice, payload.currency)
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
                    if (e.status) throw e
                    // Fallback local si serveur déconnecté
                    setTransactions((curr) =>
                        curr.map((tx) => (tx.id === editingTransaction.id ? { ...tx, ...payload } : tx)),
                    )
                    queuePendingSync({ kind: 'upsert', transaction: { ...editingTransaction, ...payload } })
                    setIsOffline(true)
                    savedLocally = true
                }
                showToast(savedLocally ? 'Modification enregistrée localement; synchronisation en attente.' : 'Transaction modifiée avec succès !', 'success')
            } else {
                try {
                    const created = await createTransaction(payload)
                    setTransactions((curr) => [created, ...curr])
                } catch (e) {
                    if (e.status) throw e
                    // Fallback local si serveur déconnecté
                    const localTx = { ...payload, id: uid(), createdAt: new Date().toISOString() }
                    setTransactions((curr) => [localTx, ...curr])
                    queuePendingSync({ kind: 'upsert', transaction: localTx })
                    setIsOffline(true)
                    savedLocally = true
                }
                showToast(savedLocally ? 'Transaction enregistrée localement; synchronisation en attente.' : 'Transaction enregistrée avec succès !', 'success')
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
        const beforeIssues = new Set(validateTransactionHistory(transactions).map((issue) => issue.message))
        const remainingTransactions = transactions.filter((tx) => tx.id !== id)
        const newIssue = validateTransactionHistory(remainingTransactions).find((issue) => !beforeIssues.has(issue.message))
        if (newIssue) {
            showToast(`Suppression impossible : ${newIssue.message}`, 'error')
            return
        }
        try {
            await deleteTransaction(id)
            if (editingTransaction?.id === id) {
                setEditingTransaction(null)
            }
            setTransactions((curr) => curr.filter((tx) => tx.id !== id))
            showToast('Transaction supprimée avec succès !', 'success')
        } catch (err) {
            if (err.status) {
                showToast(err.message || 'Impossible de supprimer la transaction.', 'error')
                return
            }
            setTransactions((curr) => curr.filter((tx) => tx.id !== id))
            queuePendingSync({ kind: 'delete', id })
            setIsOffline(true)
            showToast('Transaction supprimée localement. Le serveur sera synchronisé au prochain import.', 'success')
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
        setCurrentTab('history')
    }

    // Action rapide depuis les positions (Achat / Vente préremplis)
    function handleQuickAction(type, data) {
        setEditingTransaction(null)
        setPrefillData({
            type,
            ticker: data.ticker,
            name: data.name,
            currentPrice: data.currentPrice,
            currency: data.currency,
        })
        setCurrentTab('transaction')
    }

    // Changement manuel de cours dans le tableau
    async function handlePriceChange(ticker, newPrice) {
        const cleanPrice = parseNumber(newPrice, 0)
        if (cleanPrice <= 0) {
            showToast('Le cours doit être supérieur à zéro.', 'error')
            return
        }
        setPrices((curr) => ({
            ...curr,
            [ticker]: cleanPrice,
        }))

        try {
            await updatePrice(ticker, cleanPrice, currencies[ticker])
            showToast(`Cours de ${ticker} mis à jour : ${formatCurrency(cleanPrice, currencies[ticker] || 'EUR')}`, 'success')
        } catch (err) {
            showToast(`Cours de ${ticker} mis à jour localement : ${formatCurrency(cleanPrice, currencies[ticker] || 'EUR')}`, 'success')
        }
    }

    // Exportation
    function handleExport() {
        try {
            exportPortfolioJSON({ transactions, prices, currencies, assetMetadata, tagCatalog })
            showToast('Fichier de portefeuille exporté avec succès !', 'success')
        } catch (err) {
            showToast("Erreur lors de l'exportation.", 'error')
        }
    }

    async function handleImport(event) {
        const file = event.target.files?.[0]
        if (!file) return
        try {
            const isJson = file.name.toLowerCase().endsWith('.json') || file.type.includes('json')
            const data = isJson
                ? await importPortfolioJSON(file)
                : { ...parsePortfolioCSV(await file.text()), prices: {}, currencies: {}, assetMetadata: {}, tagCatalog: [] }
            if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
                throw new Error("Aucune transaction n'a été trouvée dans ce fichier.")
            }
            setImportPreview({ ...data, source: file.name, sourceFormat: isJson ? 'json' : 'csv' })
            setImportMode('append')
            setImportError('')
        } catch (err) {
            showToast(err.message || "Fichier d'importation invalide.", 'error')
        } finally {
            event.target.value = ''
        }
    }

    async function confirmImport() {
        if (!importPreview) return
        if (importPreview.rowErrors?.length) {
            setImportError(`Corrigez le fichier : ${importPreview.rowErrors[0]}`)
            return
        }
        const replace = importMode === 'replace'
        const sourceTransactions = importPreview.transactions.map((tx) => ({ ...tx, id: tx.id || uid() }))
        const merged = replace ? [...sourceTransactions] : (() => {
            const byId = new Map(transactions.map((tx) => [tx.id, tx]))
            for (const tx of sourceTransactions) byId.set(tx.id || uid(), tx)
            return [...byId.values()]
        })()
        const issues = validateTransactionHistory(merged)
        if (issues.length) {
            setImportError(issues[0].message)
            return
        }

        let savedLocally = false
        try {
            const bulkRes = await bulkImportTransactions(
                sourceTransactions,
                importPreview.prices || {},
                importPreview.currencies || {},
                replace,
                replace && importPreview.sourceFormat === 'json',
            )
            setTransactions(Array.isArray(bulkRes?.transactions) ? bulkRes.transactions : merged)
            setIsOffline(false)
        } catch (err) {
            if (err.status) {
                setImportError(err.message || "L'importation a été refusée.")
                return
            }
            setTransactions(merged)
            queuePendingSync({
                kind: 'bulk',
                transactions: sourceTransactions,
                prices: importPreview.prices || {},
                currencies: importPreview.currencies || {},
                replace,
                replacePrices: replace && importPreview.sourceFormat === 'json',
            })
            setIsOffline(true)
            savedLocally = true
        }

        if (importMode === 'replace' && importPreview.sourceFormat === 'json') {
            setPrices(importPreview.prices || {})
            setCurrencies(importPreview.currencies || {})
            setAssetMetadata(importPreview.assetMetadata || {})
            setTagCatalog(importPreview.tagCatalog || ['Action', 'ETF', 'PEA', 'CTO'])
        } else {
            if (importPreview.prices) setPrices((prev) => ({ ...prev, ...importPreview.prices }))
            if (importPreview.currencies) setCurrencies((prev) => ({ ...prev, ...importPreview.currencies }))
            if (importPreview.assetMetadata && Object.keys(importPreview.assetMetadata).length) setAssetMetadata((prev) => ({ ...prev, ...importPreview.assetMetadata }))
            if (importPreview.tagCatalog?.length) setTagCatalog((prev) => [...new Set([...prev, ...importPreview.tagCatalog])])
        }
        setEditingTransaction(null)
        setPrefillData(null)
        setImportPreview(null)
        setImportError('')
        setCurrentTab('dashboard')
        showToast(
            savedLocally
                ? `${sourceTransactions.length} opération${sourceTransactions.length > 1 ? 's' : ''} importée${sourceTransactions.length > 1 ? 's' : ''} localement; synchronisation en attente.`
                : `${sourceTransactions.length} opération${sourceTransactions.length > 1 ? 's' : ''} importée${sourceTransactions.length > 1 ? 's' : ''}.`,
            'success',
        )
        refreshQuotesForTickers(sourceTransactions.map((tx) => tx.ticker).filter(Boolean))
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
                        {(isOffline || pendingSync.length > 0) && (
                            <span className="badge badge-sell" title="Le serveur API est inaccessible. Vos données restent conservées en local.">
                                {isOffline ? <WifiOff size={13} /> : <AlertCircle size={13} />}
                                {isOffline ? 'Mode local' : 'Synchronisation en attente'}{pendingSync.length ? ` · ${pendingSync.length}` : ''}
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
                            title="Sauvegarder votre portefeuille au format JSON"
                        >
                            <Download size={15} />
                            <span>Exporter</span>
                        </button>

                       
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
                            <DashboardView snapshot={snapshot} forexRates={forexRates} assetMetadata={assetMetadata} />
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
                                forexRates={forexRates}
                                assetMetadata={assetMetadata}
                                onAssetMetadataChange={updateAssetMetadata}
                                tagCatalog={tagCatalog}
                                onTagCatalogChange={setTagCatalog}
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
                                positions={snapshot.positions}
                                currencies={currencies}
                                currentPrice={
                                    editingTransaction
                                        ? prices[editingTransaction.ticker] || ''
                                        : prefillData?.currentPrice || ''
                                }
                                forexRate={forexRate}
                                forexRates={forexRates}
                            />
                        </div>

                        {/* Vue 4 : Historique */}
                        <div className={currentTab === 'history' ? 'tab-view active' : 'tab-view'}>
                            <HistoryView
                                transactions={transactions}
                                onDelete={handleDeleteTransaction}
                                onEdit={handleEditTransaction}
                                forexRate={forexRate}
                                forexRates={forexRates}
                                currencies={currencies}
                            />
                        </div>
                    </>
                )}
            </main>

            {importPreview && (
                <div className="modal-overlay" onClick={() => { setImportPreview(null); setImportError('') }}>
                    <div className="modal-box import-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <FileSpreadsheet size={22} className="text-accent" />
                            <h3>Vérifier l'importation</h3>
                        </div>
                        <p className="modal-body">
                            <strong>{importPreview.source}</strong> · {importPreview.transactions.length} opération{importPreview.transactions.length > 1 ? 's' : ''} détectée{importPreview.transactions.length > 1 ? 's' : ''}.
                            Choisissez comment les intégrer à votre historique.
                        </p>
                        <div className="import-guidance">
                            CSV : une ligne par opération, type Achat/Vente/Dividende. Pour un dividende, indiquez le montant brut dans « unitPrice », une quantité de 1 et les retenues dans « fees ». Le taux « exchangeRate » indique combien d'unités de devise valent 1 €.
                        </div>
                        {missingImportRates > 0 && (
                            <div className="import-warning-box">
                                {missingImportRates} opération{missingImportRates > 1 ? 's' : ''} en devise étrangère sans taux historique. Le taux actuel sera utilisé s'il est disponible; indiquez le taux du relevé pour une conversion fiable.
                            </div>
                        )}

                        <div className="import-mode-grid">
                            <label className={importMode === 'append' ? 'import-mode-option selected' : 'import-mode-option'}>
                                <input type="radio" name="import-mode" checked={importMode === 'append'} onChange={() => { setImportMode('append'); setImportError('') }} />
                                <span><strong>Ajouter à l'historique</strong><small>Pour un relevé partiel. Les opérations sans identifiant seront ajoutées à chaque nouvel import.</small></span>
                            </label>
                            <label className={importMode === 'replace' ? 'import-mode-option selected danger' : 'import-mode-option danger'}>
                                <input type="radio" name="import-mode" checked={importMode === 'replace'} onChange={() => { setImportMode('replace'); setImportError('') }} />
                                <span><strong>Remplacer l'historique</strong><small>Efface toutes les opérations actuelles et charge ce fichier complet.</small></span>
                            </label>
                        </div>

                        <div className="import-preview-list">
                            <div className="import-preview-heading"><span>Date</span><span>Opération</span><span>Actif</span><span>Montant brut</span></div>
                            {importPreview.transactions.slice(0, 6).map((tx, index) => (
                                <div className="import-preview-row" key={tx.id || `${tx.ticker}-${index}`}>
                                    <span>{formatDateFR(tx.date)}</span>
                                    <span>{tx.type === 'BUY' ? 'Achat' : tx.type === 'SELL' ? 'Vente' : 'Dividende'}</span>
                                    <span>{tx.ticker}</span>
                                    <span>{formatCurrency(tx.type === 'DIVIDEND' ? tx.unitPrice : tx.quantity * tx.unitPrice, tx.currency || 'EUR')}</span>
                                </div>
                            ))}
                            {importPreview.transactions.length > 6 && <div className="import-preview-more">… et {importPreview.transactions.length - 6} autre{importPreview.transactions.length - 6 > 1 ? 's' : ''} opération{importPreview.transactions.length - 6 > 1 ? 's' : ''}</div>}
                        </div>

                        {importPreview.rowErrors?.length > 0 && (
                            <div className="import-error-box">{importPreview.rowErrors.length} ligne{importPreview.rowErrors.length > 1 ? 's' : ''} invalide{importPreview.rowErrors.length > 1 ? 's' : ''} : {importPreview.rowErrors[0]}</div>
                        )}
                        {importHistoryIssues.length > 0 && (
                            <div className="import-error-box">Historique incohérent : {importHistoryIssues[0].message}</div>
                        )}
                        {importError && <div className="import-error-box">{importError}</div>}

                        <div className="modal-footer">
                            <button type="button" className="btn-secondary" onClick={() => { setImportPreview(null); setImportError('') }}>Annuler</button>
                            <button
                                type="button"
                                className="btn-primary"
                                disabled={Boolean(importPreview.rowErrors?.length || importHistoryIssues.length)}
                                onClick={confirmImport}
                            >
                                <Upload size={15} /> Importer {importPreview.transactions.length} opération{importPreview.transactions.length > 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
