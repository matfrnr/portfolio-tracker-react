import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Tabs from './components/Tabs'
import KpiRow from './components/KpiRow'
import DashboardView from './components/DashboardView'
import { savePerformanceSnapshot } from './api/snapshots'
import PositionsView from './components/PositionsView'
import TransactionView from './components/TransactionView'
import HistoryView from './components/HistoryView'
import { computePortfolio, validateTransaction, validateTransactionHistory, uid, parseNumber, formatCurrency, formatDateFR, formatQty, defaultCurrencyForTicker, isCryptoTicker, MANUAL_SAVINGS_TICKER, MANUAL_CASH_ACCOUNTS_KEY, MANUAL_CASH_ASSETS } from './lib/portfolio'
import { exportPortfolioJSON, importPortfolioJSON } from './lib/storage'
import { parsePortfolioCSV, downloadPortfolioCSVTemplate } from './lib/portfolioCsv'
import { getPortfolioSettings, savePortfolioSettings } from './api/settings'
import {
    getTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    bulkImportTransactions,
} from './api/transactions'
import { getPrices, updatePrice, savePrices, fetchLiveQuotes, getForexRate } from './api/prices'
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
    LogOut,
    UserRound,
    ChevronDown,
} from 'lucide-react'

const STORAGE_KEYS = {
    transactions: 'portfolio-tracker:transactions',
    prices: 'portfolio-tracker:prices',
    currencies: 'portfolio-tracker:currencies',
    forex: 'portfolio-tracker:forex',
    pendingSync: 'portfolio-tracker:pending-sync',
    assetMetadata: 'portfolio-tracker:asset-metadata',
    tagCatalog: 'portfolio-tracker:tag-catalog',
    scope: 'portfolio-tracker:scope',
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

export default function App({ user = null, onSignOut }) {
    const storageKey = (key) => user?.id ? `${STORAGE_KEYS[key]}:${user.id}` : STORAGE_KEYS[key]
    const [currentTab, setCurrentTab] = useState('dashboard')
    const [portfolioScope, setPortfolioScope] = useState(() => {
        try { return localStorage.getItem(storageKey('scope')) || 'stocks' } catch { return 'stocks' }
    })
    const [settingsReady, setSettingsReady] = useState(!user)
    const importFileInput = useRef(null)
    const profileMenuRef = useRef(null)
    const [profileMenuOpen, setProfileMenuOpen] = useState(false)

    // Initialisation immédiate depuis le stockage local (cache de secours permanent)
    const [transactions, setTransactions] = useState(() => {
        try {
            const raw = localStorage.getItem(storageKey('transactions'))
            return raw ? JSON.parse(raw) : []
        } catch {
            return []
        }
    })

    const [prices, setPrices] = useState(() => {
        try {
            const raw = localStorage.getItem(storageKey('prices'))
            return raw ? JSON.parse(raw) : {}
        } catch {
            return {}
        }
    })

    // Devise native par ticker (ex: { AAPL: 'USD', LVMH: 'EUR' })
    const [currencies, setCurrencies] = useState(() => {
        try { return JSON.parse(localStorage.getItem(storageKey('currencies')) || '{}') } catch { return {} }
    })
    const [assetMetadata, setAssetMetadata] = useState(() => {
        try { return JSON.parse(localStorage.getItem(storageKey('assetMetadata')) || '{}') } catch { return {} }
    })
    const [tagCatalog, setTagCatalog] = useState(() => {
        try { return JSON.parse(localStorage.getItem(storageKey('tagCatalog')) || '["Action","ETF","PEA","CTO"]') } catch { return ['Action', 'ETF', 'PEA', 'CTO'] }
    })
    // Taux de change EUR/USD en temps réel (fallback : 1.085)
    const [forexRate, setForexRate] = useState(() => {
        try {
            const cached = JSON.parse(localStorage.getItem(storageKey('forex')) || '{}')
            return Number(cached.USD || cached.EURUSD) || 1.085
        } catch { return 1.085 }
    })
    const [forexRates, setForexRates] = useState(() => {
        try { return JSON.parse(localStorage.getItem(storageKey('forex')) || '{"EUR":1,"USD":1.085}') } catch { return { EUR: 1, USD: 1.085 } }
    })

    const [loading, setLoading] = useState(true)
    const [isOffline, setIsOffline] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [lastRefreshTime, setLastRefreshTime] = useState('')
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [prefillData, setPrefillData] = useState(null)
    const [toast, setToast] = useState(null) // { message, type: 'success' | 'error' }
    const [pendingSync, setPendingSync] = useState(() => {
        try { return JSON.parse(localStorage.getItem(storageKey('pendingSync')) || '[]') } catch { return [] }
    })
    const [importPreview, setImportPreview] = useState(null)
    const [importMode, setImportMode] = useState('append')
    const [importError, setImportError] = useState('')
    const [snapshotSaveError, setSnapshotSaveError] = useState('')

    useEffect(() => {
        try { localStorage.setItem(storageKey('scope'), portfolioScope) } catch {}
    }, [portfolioScope, user?.id])

    useEffect(() => {
        if (!profileMenuOpen) return undefined
        function closeOnOutsideClick(event) {
            if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false)
        }
        function closeOnEscape(event) {
            if (event.key === 'Escape') setProfileMenuOpen(false)
        }
        document.addEventListener('mousedown', closeOnOutsideClick)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideClick)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [profileMenuOpen])

    // Sauvegarde continue dans le localStorage en double sécurité
    useEffect(() => {
        try {
            localStorage.setItem(storageKey('transactions'), JSON.stringify(transactions))
        } catch (e) {
            // no-op
        }
    }, [transactions])

    useEffect(() => {
        try {
            localStorage.setItem(storageKey('prices'), JSON.stringify(prices))
        } catch (e) {
            // no-op
        }
    }, [prices])

    useEffect(() => {
        try { localStorage.setItem(storageKey('currencies'), JSON.stringify(currencies)) } catch {}
    }, [currencies])

    useEffect(() => {
        try { localStorage.setItem(storageKey('assetMetadata'), JSON.stringify(assetMetadata)) } catch {}
    }, [assetMetadata])
    useEffect(() => {
        try { localStorage.setItem(storageKey('tagCatalog'), JSON.stringify(tagCatalog)) } catch {}
    }, [tagCatalog])

    function updateAssetMetadata(ticker, updates) {
        const symbol = String(ticker || '').trim().toUpperCase()
        if (!symbol) return
        setAssetMetadata((current) => ({
            ...current,
            [symbol]: { ...(current[symbol] || {}), ...updates },
        }))
    }

    function updateManualSavings(updates) {
        setAssetMetadata((current) => {
            const existing = current[MANUAL_SAVINGS_TICKER] || {}
            const now = updates.updatedAt || new Date().toISOString()
            const trackingStartedAt = existing.trackingStartedAt || (Number(updates.currentValue) > 0 ? now : null)
            return {
                ...current,
                [MANUAL_SAVINGS_TICKER]: {
                    ...existing,
                    ...updates,
                    ...(trackingStartedAt ? { trackingStartedAt } : {}),
                },
            }
        })
    }

    function updateManualCashBalances(updates) {
        setAssetMetadata((current) => ({
            ...current,
            [MANUAL_CASH_ACCOUNTS_KEY]: {
                ...(current[MANUAL_CASH_ACCOUNTS_KEY] || {}),
                ...updates,
            },
        }))
    }

    useEffect(() => {
        try { localStorage.setItem(storageKey('forex'), JSON.stringify(forexRates)) } catch {}
    }, [forexRates])

    useEffect(() => {
        try { localStorage.setItem(storageKey('pendingSync'), JSON.stringify(pendingSync)) } catch {}
    }, [pendingSync])

    useEffect(() => {
        if (!user || !settingsReady) return undefined
        const timeout = setTimeout(() => {
            savePortfolioSettings({ currencies, assetMetadata, tagCatalog }).catch((error) => {
                console.warn('Impossible de synchroniser les réglages Supabase :', error)
            })
        }, 350)
        return () => clearTimeout(timeout)
    }, [user?.id, settingsReady, currencies, assetMetadata, tagCatalog])

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
                    if (user) {
                        savePrices(newPrices, newCurrencies).catch((error) => {
                            console.warn('Impossible de synchroniser les cours Supabase :', error)
                        })
                    }
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
        [user?.id],
    )

    // Chargement initial des données depuis le serveur
    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true)
                let [transactionsData, pricesRes, forexRes, settingsRes] = await Promise.all([
                    getTransactions(),
                    getPrices(),
                    getForexRate().catch(() => null),
                    getPortfolioSettings(),
                ])

                let queuedOperations = []
                try {
                    const savedOperations = JSON.parse(localStorage.getItem(storageKey('pendingSync')) || '[]')
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

                if (user) {
                    setCurrencies((prev) => ({ ...prev, ...(settingsRes?.currencies || {}) }))
                    setAssetMetadata(settingsRes?.assetMetadata || {})
                    setTagCatalog(settingsRes?.tagCatalog || ['Action', 'ETF', 'PEA', 'CTO'])
                    setSettingsReady(true)
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
    }, [refreshQuotesForTickers, showToast, user?.id])

    const scopedTransactions = useMemo(() => transactions.filter((tx) => {
        const type = assetMetadata[tx.ticker]?.portfolioType || (isCryptoTicker(tx.ticker, tx.name) ? 'crypto' : 'stocks')
        return portfolioScope === 'all' || type === portfolioScope
    }), [transactions, assetMetadata, portfolioScope])

    const cryptoTrackingStartedAt = useMemo(() => {
        const timestamps = transactions
            .filter((tx) => {
                const type = assetMetadata[tx.ticker]?.portfolioType
                return type === 'crypto' || (!type && isCryptoTicker(tx.ticker, tx.name))
            })
            .map((tx) => new Date(tx.createdAt || 0).getTime())
            .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
        return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null
    }, [transactions, assetMetadata])
    const savingsTrackingStartedAt = assetMetadata[MANUAL_SAVINGS_TICKER]?.trackingStartedAt || null
    const combinedTrackingStartedAt = useMemo(() => {
        const timestamps = [cryptoTrackingStartedAt, savingsTrackingStartedAt]
            .map((value) => new Date(value || 0).getTime())
            .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
        return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
    }, [cryptoTrackingStartedAt, savingsTrackingStartedAt])
    const performanceTrackingStartedAt = portfolioScope === 'crypto'
        ? cryptoTrackingStartedAt
        : portfolioScope === 'savings'
            ? savingsTrackingStartedAt
            : portfolioScope === 'all'
                ? combinedTrackingStartedAt
                : null

    // Calcul du portefeuille pour le périmètre sélectionné.
    const snapshot = useMemo(() => {
        try {
            const baseTransactions = ['savings', 'cash'].includes(portfolioScope) ? [] : scopedTransactions
            const base = computePortfolio(baseTransactions, prices, currencies, forexRates)
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
            const includeSavings = portfolioScope === 'all' || portfolioScope === 'savings'
            const includeCash = portfolioScope === 'all' || portfolioScope === 'cash'
            const savingsSettings = assetMetadata[MANUAL_SAVINGS_TICKER] || {}
            const savingsValue = Math.max(0, parseNumber(savingsSettings.currentValue, 0))
            const savingsPnL = Math.min(parseNumber(savingsSettings.unrealizedPnL, 0), savingsValue)
            const savingsInvested = savingsValue - savingsPnL
            if (includeSavings && (savingsValue > 0 || savingsSettings.trackingStartedAt)) {
                const savingsReturn = savingsInvested > 0 ? savingsPnL / savingsInvested * 100 : 0
                positions.push({
                    ticker: MANUAL_SAVINGS_TICKER,
                    name: 'Épargne salariale',
                    currency: 'EUR',
                    currencyWasExplicit: true,
                    quantity: 1,
                    currentPrice: savingsValue,
                    currentPriceEUR: savingsValue,
                    hasLivePrice: false,
                    averageCost: savingsInvested,
                    averageCostEUR: savingsInvested,
                    costBasis: savingsInvested,
                    costBasisNative: savingsInvested,
                    marketValue: savingsValue,
                    marketValueNative: savingsValue,
                    unrealizedPnL: savingsPnL,
                    unrealizedPnLNative: savingsPnL,
                    unrealizedPct: savingsReturn,
                    unrealizedPctNative: savingsReturn,
                    isManualSavings: true,
                })
            }
            const cashSettings = assetMetadata[MANUAL_CASH_ACCOUNTS_KEY] || {}
            const cashPositions = includeCash ? MANUAL_CASH_ASSETS.flatMap((asset) => {
                const rawBalance = cashSettings[asset.key]
                const balance = Math.max(0, parseNumber(rawBalance, 0))
                if (balance <= 0) return []
                return [{
                    ticker: asset.ticker,
                    name: asset.name,
                    currency: 'EUR',
                    currencyWasExplicit: true,
                    quantity: 1,
                    currentPrice: balance,
                    currentPriceEUR: balance,
                    hasLivePrice: false,
                    averageCost: 0,
                    averageCostEUR: 0,
                    costBasis: 0,
                    costBasisNative: 0,
                    marketValue: balance,
                    marketValueNative: balance,
                    unrealizedPnL: 0,
                    unrealizedPnLNative: 0,
                    unrealizedPct: 0,
                    unrealizedPctNative: 0,
                    isManualCash: true,
                }]
            }) : []
            positions.push(...cashPositions)
            const currentValue = positions.reduce((sum, position) => sum + position.marketValue, 0)
            const investmentPositions = positions.filter((position) => !position.isManualCash)
            const invested = investmentPositions.reduce((sum, position) => sum + position.costBasis, 0)
            const unrealizedPnL = investmentPositions.reduce((sum, position) => sum + position.unrealizedPnL, 0)
            const cashValue = cashPositions.reduce((sum, position) => sum + position.marketValue, 0)
            const realizedPnL = base.realizedPnL
            const dividendsNet = base.dividendsNet
            const totalPnL = unrealizedPnL + realizedPnL + dividendsNet
            const totalBought = base.totalBought + (includeSavings ? savingsInvested : 0)
            const totalsByCurrency = new Map()
            for (const position of positions) {
                totalsByCurrency.set(position.currency, (totalsByCurrency.get(position.currency) || 0) + position.marketValueNative)
            }
            const normalizedPositions = positions.map((position) => ({
                ...position,
                allocationWeight: (totalsByCurrency.get(position.currency) || 0) > 0 ? position.marketValueNative / totalsByCurrency.get(position.currency) * 100 : 0,
                allocationWeightEUR: currentValue > 0 ? position.marketValue / currentValue * 100 : 0,
            }))
            const ranked = normalizedPositions.filter((position) => !position.isManualCash).sort((a, b) => b.unrealizedPct - a.unrealizedPct)
            return {
                ...base,
                positions: normalizedPositions,
                currentValue,
                cashValue,
                invested,
                unrealizedPnL,
                unrealizedPct: invested > 0 ? unrealizedPnL / invested * 100 : 0,
                totalBought,
                totalPnL,
                totalPnLPct: totalBought > 0 ? totalPnL / totalBought * 100 : 0,
                realizedPnL,
                dividendsNet,
                topPerformer: ranked[0] || null,
                worstPerformer: ranked[ranked.length - 1] || null,
            }
        } catch (err) {
            console.error('Erreur calcul portefeuille:', err)
            return {
                ...EMPTY_SNAPSHOT,
                transactionCount: scopedTransactions.length,
            }
        }
    }, [scopedTransactions, prices, currencies, forexRates, assetMetadata, portfolioScope])

    // Conserve le dernier état constaté de chaque journée pour le périmètre affiché.
    useEffect(() => {
        if (loading || isOffline || isRefreshing || !settingsReady || ['savings', 'cash'].includes(portfolioScope) || snapshot.positions.length <= 0) return undefined
        const timeout = setTimeout(() => {
            savePerformanceSnapshot(portfolioScope, snapshot).then(() => {
                setSnapshotSaveError('')
            }).catch((error) => {
                console.warn('Impossible de sauvegarder le relevé de performance :', error)
                setSnapshotSaveError(error?.message || 'Erreur de synchronisation')
            })
        }, 800)
        return () => clearTimeout(timeout)
    }, [loading, isOffline, isRefreshing, settingsReady, portfolioScope, snapshot.positions.length, snapshot.transactionCount, snapshot.currentValue, snapshot.invested, snapshot.realizedPnL, snapshot.unrealizedPnL, snapshot.dividendsNet, snapshot.totalPnL])

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
            quantity: type === 'SELL' ? data.quantity : undefined,
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
        const importedAt = new Date().toISOString()
        const sourceTransactions = importPreview.transactions.map((tx) => ({
            ...tx,
            id: tx.id || uid(),
            createdAt: tx.createdAt || importedAt,
        }))
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

                        <div className="profile-menu" ref={profileMenuRef}>
                            <button type="button" className="btn-header-action profile-menu-trigger" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>
                                <UserRound size={16} />
                                <span>Profil</span>
                                <ChevronDown size={14} className={profileMenuOpen ? 'profile-chevron open' : 'profile-chevron'} />
                            </button>
                            <input ref={importFileInput} type="file" accept=".json,.csv,text/csv,application/json" onChange={(event) => { setProfileMenuOpen(false); handleImport(event) }} hidden />
                            {profileMenuOpen && (
                                <div className="profile-menu-popover" role="menu">
                                    {(isOffline || pendingSync.length > 0) && (
                                        <div className="profile-sync-status">
                                            {isOffline ? <WifiOff size={14} /> : <AlertCircle size={14} />}
                                            <span>{isOffline ? 'Mode local' : 'Synchronisation en attente'}{pendingSync.length ? ` · ${pendingSync.length}` : ''}</span>
                                        </div>
                                    )}
                                    <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); importFileInput.current?.click() }}>
                                        <Upload size={16} /><span>Importer</span>
                                    </button>
                                    <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); handleExport() }}>
                                        <Download size={16} /><span>Exporter</span>
                                    </button>
                                    {user && <>
                                        <div className="profile-menu-divider" />
                                        <button type="button" role="menuitem" className="profile-signout" onClick={() => { setProfileMenuOpen(false); onSignOut?.() }}>
                                            <LogOut size={16} /><span>Déconnexion</span>
                                        </button>
                                    </>}
                                </div>
                            )}
                        </div>

                       
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
                <div className="portfolio-navigation-row">
                    <Tabs
                        currentTab={currentTab}
                        onChange={(tab) => setCurrentTab(['savings', 'cash'].includes(portfolioScope) && ['transaction', 'history'].includes(tab) ? 'dashboard' : tab)}
                        positionsCount={snapshot.positions.length}
                        portfolioScope={portfolioScope}
                    />
                    <div className="portfolio-scope-control">
                        <label htmlFor="portfolio-scope">Portefeuille</label>
                        <select id="portfolio-scope" value={portfolioScope} onChange={(event) => {
                            const nextScope = event.target.value
                            setPortfolioScope(nextScope)
                            if (['savings', 'cash'].includes(nextScope)) setCurrentTab('dashboard')
                        }}>
                            <option value="stocks">Bourse</option>
                            <option value="crypto">Cryptomonnaies</option>
                            <option value="savings">Épargne salariale</option>
                            <option value="cash">Livrets</option>
                            <option value="all">Tout</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="card loading-card">
                        <RefreshCw size={24} className="spin-icon text-accent" />
                        <p>Chargement de votre portefeuille...</p>
                    </div>
                ) : (
                    <>
                        {/* Vue 1 : Tableau de bord */}
                        <div className={currentTab === 'dashboard' ? 'tab-view active' : 'tab-view'}>
                            {portfolioScope !== 'cash' && <KpiRow snapshot={snapshot} portfolioScope={portfolioScope} />}
                            <DashboardView
                                snapshot={snapshot}
                                forexRates={forexRates}
                                assetMetadata={assetMetadata}
                                portfolioScope={portfolioScope}
                                trackingStartedAt={performanceTrackingStartedAt}
                                savingsData={assetMetadata[MANUAL_SAVINGS_TICKER] || {}}
                                onSavingsSave={updateManualSavings}
                                cashData={assetMetadata[MANUAL_CASH_ACCOUNTS_KEY] || {}}
                                onCashSave={updateManualCashBalances}
                                performanceSaveError={snapshotSaveError}
                            />
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
                                portfolioScope={portfolioScope}
                                cashData={assetMetadata[MANUAL_CASH_ACCOUNTS_KEY] || {}}
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
                                transactions={scopedTransactions}
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
                                transactions={scopedTransactions}
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
