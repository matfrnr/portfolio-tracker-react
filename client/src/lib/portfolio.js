const EPSILON = 1e-6

export function formatCurrency(value, currency = 'EUR') {
    const num = Number(value)
    const curr = currency ? String(currency).toUpperCase() : 'EUR'
    try {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: curr }).format(Number.isFinite(num) ? num : 0)
    } catch {
        return `${num.toFixed(2).replace('.', ',')} ${curr}`
    }
}

export function formatPercent(value, showSign = false) {
    const num = Number(value)
    if (!Number.isFinite(num)) return '0,00 %'
    const sign = showSign && num > 0 ? '+' : ''
    return `${sign}${num.toFixed(2).replace('.', ',')} %`
}

export function formatQty(value) {
    const num = Number(value)
    if (!Number.isFinite(num)) return '0'
    return Number.isInteger(num) ? String(num) : num.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

export function parseNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
    const normalized = String(value).trim().replace(/[\s\u00a0]/g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
}

export function getTodayISODate() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function toISODateString(dateVal) {
    if (!dateVal) return getTodayISODate()
    if (typeof dateVal === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal
        if (dateVal.includes('T')) return dateVal.split('T')[0]
    }
    const d = new Date(dateVal)
    if (Number.isNaN(d.getTime())) return getTodayISODate()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateFR(dateVal) {
    if (!dateVal) return ''
    const iso = toISODateString(dateVal)
    const [year, month, day] = iso.split('-')
    return `${day}/${month}/${year}`
}

export function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeTicker(value) {
    return value ? String(value).trim().toUpperCase() : ''
}

export function defaultCurrencyForTicker(ticker) {
    const symbol = normalizeTicker(ticker)
    if (/\.(PA|DE|F|DU|AS|BR|MC|MI|VI|HE|IR)$/.test(symbol)) return 'EUR'
    if (symbol.endsWith('.L')) return 'GBP'
    if (symbol.endsWith('.TO') || symbol.endsWith('.V')) return 'CAD'
    if (symbol.endsWith('.AX')) return 'AUD'
    if (symbol.endsWith('.T')) return 'JPY'
    if (symbol.endsWith('.SW')) return 'CHF'
    if (symbol.endsWith('.ST')) return 'SEK'
    if (symbol.endsWith('.OL')) return 'NOK'
    if (symbol.endsWith('.CO')) return 'DKK'
    if (symbol.endsWith('-EUR')) return 'EUR'
    if (symbol.endsWith('-GBP')) return 'GBP'
    if (symbol.endsWith('-CAD')) return 'CAD'
    if (symbol.endsWith('-USD')) return 'USD'
    return 'USD'
}

function normalizeCurrency(currency, ticker = '') {
    const value = String(currency || defaultCurrencyForTicker(ticker) || 'EUR').trim().toUpperCase()
    return /^[A-Z]{3}$/.test(value) ? value : 'EUR'
}

// FX convention: how many units of the asset's currency equal 1 EUR.
export function exchangeRateFor(currency, rates = {}, fallback = 1.085) {
    const curr = normalizeCurrency(currency)
    if (curr === 'EUR') return 1
    const map = rates && typeof rates === 'object' ? rates : {}
    const value = Number(map[curr] ?? (curr === 'USD' ? map.EURUSD : undefined))
    if (Number.isFinite(value) && value > 0) return value
    const legacyRate = Number(map.EURUSD)
    if (curr === 'USD' && Number.isFinite(legacyRate) && legacyRate > 0) return legacyRate
    const numericFallback = Number(fallback)
    return curr === 'USD' && Number.isFinite(numericFallback) && numericFallback > 0 ? numericFallback : 1
}

export function hasExchangeRate(currency, rates = {}) {
    const curr = normalizeCurrency(currency)
    if (curr === 'EUR') return true
    if (typeof rates === 'number') return curr === 'USD' && Number.isFinite(rates) && rates > 0
    const value = Number(rates?.[curr] ?? (curr === 'USD' ? rates?.EURUSD : undefined))
    return Number.isFinite(value) && value > 0
}

export function transactionRate(transaction, currentRates = 1.085) {
    const currency = normalizeCurrency(transaction.currency, transaction.ticker)
    const storedRate = Number(transaction.exchangeRate)
    if (currency === 'EUR') return 1
    if (Number.isFinite(storedRate) && storedRate > 0 && !(currency === 'USD' && storedRate === 1)) return storedRate
    return exchangeRateFor(currency, currentRates)
}

function sortTransactionsByDate(transactions) {
    return [...transactions]
        .map((transaction, index) => ({ transaction, index }))
        .sort((a, b) => {
            const aDate = new Date(a.transaction.date || 0).getTime() || 0
            const bDate = new Date(b.transaction.date || 0).getTime() || 0
            if (aDate !== bDate) return aDate - bDate
            const aCreated = new Date(a.transaction.createdAt || 0).getTime() || 0
            const bCreated = new Date(b.transaction.createdAt || 0).getTime() || 0
            if (aCreated !== bCreated) return aCreated - bCreated
            const idOrder = String(a.transaction.id || '').localeCompare(String(b.transaction.id || ''))
            if (idOrder) return idOrder
            return a.index - b.index
        })
        .map(({ transaction }) => transaction)
}

export function getAvailableQuantity(transactions, ticker, excludeTxId = null) {
    const symbol = normalizeTicker(ticker)
    if (!symbol) return 0
    let available = 0
    for (const tx of sortTransactionsByDate(transactions)) {
        if (excludeTxId && tx.id === excludeTxId) continue
        if (normalizeTicker(tx.ticker) !== symbol) continue
        if (tx.type === 'BUY') available += parseNumber(tx.quantity, 0)
        else if (tx.type === 'SELL') available -= parseNumber(tx.quantity, 0)
    }
    return Math.max(0, available)
}

export function validateTransactionHistory(transactions = []) {
    const holdings = new Map()
    const issues = []
    for (const tx of sortTransactionsByDate(transactions)) {
        const ticker = normalizeTicker(tx.ticker)
        if (!ticker || tx.type === 'DIVIDEND') continue
        const quantity = parseNumber(tx.quantity, 0)
        const held = holdings.get(ticker) || 0
        if (tx.type === 'BUY') {
            holdings.set(ticker, held + quantity)
        } else if (tx.type === 'SELL') {
            if (quantity > held + EPSILON) {
                issues.push({
                    id: tx.id,
                    ticker,
                    date: tx.date,
                    requested: quantity,
                    available: Math.max(0, held),
                    message: `Vente de ${formatQty(quantity)} ${ticker} le ${formatDateFR(tx.date)} alors que ${formatQty(Math.max(0, held))} seulement étaient détenus à cette date.`,
                })
            }
            holdings.set(ticker, Math.max(0, held - quantity))
        }
    }
    return issues
}

export function validateTransaction(form, transactions = [], excludeTxId = null) {
    const type = String(form.type || '').toUpperCase()
    const ticker = normalizeTicker(form.ticker)
    const currency = normalizeCurrency(form.currency, ticker)
    const exchangeRate = parseNumber(form.exchangeRate, 0)
    const fees = parseNumber(form.fees, 0)
    const unitPrice = parseNumber(form.unitPrice, 0)
    const isDividend = type === 'DIVIDEND'
    const quantity = isDividend ? 1 : parseNumber(form.quantity, 0)

    if (!['BUY', 'SELL', 'DIVIDEND'].includes(type)) return 'Type d’opération invalide.'
    if (!ticker) return 'Le ticker est obligatoire.'
    if (!form.date || Number.isNaN(new Date(form.date).getTime())) return 'La date est invalide.'
    if (currency !== 'EUR' && exchangeRate <= 0) return `Saisissez le taux de change historique pour ${currency}.`
    if (!isDividend && quantity <= 0) return 'La quantité doit être supérieure à 0.'
    if (unitPrice <= 0) return isDividend ? 'Le montant du dividende doit être supérieur à 0.' : 'Le prix unitaire doit être supérieur à 0.'
    if (fees < 0) return 'Les frais ou retenues ne peuvent pas être négatifs.'
    if (isDividend && fees > unitPrice) return 'Les retenues ne peuvent pas dépasser le montant brut du dividende.'

    const candidate = {
        ...form,
        id: excludeTxId || form.id || `candidate-${Date.now()}`,
        createdAt: form.createdAt || new Date().toISOString(),
        type,
        ticker,
        quantity,
    }
    const proposedHistory = [...transactions.filter((tx) => tx.id !== excludeTxId), candidate]
    const candidateIssue = validateTransactionHistory(proposedHistory).find((issue) => issue.id === candidate.id)
    if (candidateIssue) return `Vente impossible : ${candidateIssue.message}`
    return null
}

export function buildPositions(transactions, currentRates = 1.085) {
    const positionsMap = new Map()
    let realizedPnL = 0
    let totalFees = 0
    let totalBoughtEUR = 0
    let totalSoldEUR = 0
    let dividendsGrossEUR = 0
    let dividendsNetEUR = 0
    const oversellIssues = []
    const dataWarnings = []

    for (const tx of sortTransactionsByDate(transactions)) {
        const ticker = normalizeTicker(tx.ticker)
        if (!ticker) continue
        const currency = normalizeCurrency(tx.currency, ticker)
        const hasExplicitCurrency = Boolean(tx.currency)
        const rate = transactionRate(tx, currentRates)
        if (currency !== 'EUR' && (!(Number(tx.exchangeRate) > 0) || (currency === 'USD' && Number(tx.exchangeRate) === 1))) {
            dataWarnings.push(`Taux historique absent pour ${ticker} (${currency}) le ${formatDateFR(tx.date)}; le taux actuel sert d'estimation.`)
        }
        const quantity = parseNumber(tx.quantity, 0)
        const unitPrice = parseNumber(tx.unitPrice, 0)
        const fees = parseNumber(tx.fees, 0)
        const feesEUR = fees / rate
        totalFees += feesEUR

        if (tx.type === 'DIVIDEND') {
            const grossEUR = unitPrice / rate
            dividendsGrossEUR += grossEUR
            dividendsNetEUR += (unitPrice - fees) / rate
            continue
        }

        const current = positionsMap.get(ticker) || {
            ticker,
            name: tx.name ? String(tx.name).trim() : ticker,
            currency,
            currencyWasExplicit: hasExplicitCurrency,
            quantity: 0,
            costBasisNative: 0,
            costBasisEUR: 0,
            realizedPnLEUR: 0,
            totalBought: 0,
            totalSold: 0,
            totalInvestedEUR: 0,
        }

        if (tx.type === 'BUY') {
            const buyCostNative = quantity * unitPrice + fees
            const buyCostEUR = buyCostNative / rate
            current.quantity += quantity
            current.costBasisNative += buyCostNative
            current.costBasisEUR += buyCostEUR
            current.totalBought += quantity
            current.totalInvestedEUR += buyCostEUR
            totalBoughtEUR += buyCostEUR
        } else if (tx.type === 'SELL') {
            const matchedQuantity = Math.min(quantity, current.quantity)
            current.totalSold += matchedQuantity
            const matchedRatio = quantity > 0 ? matchedQuantity / quantity : 0
            const proceedsNative = (quantity * unitPrice - fees) * matchedRatio
            const proceedsEUR = proceedsNative / rate
            const averageCostEUR = current.quantity > 0 ? current.costBasisEUR / current.quantity : 0
            const averageCostNative = current.quantity > 0 ? current.costBasisNative / current.quantity : 0
            const soldCostEUR = averageCostEUR * matchedQuantity
            const soldCostNative = averageCostNative * matchedQuantity
            const sellGainEUR = proceedsEUR - soldCostEUR

            if (quantity > current.quantity + EPSILON) {
                oversellIssues.push({
                    id: tx.id,
                    ticker,
                    date: tx.date,
                    requested: quantity,
                    available: current.quantity,
                    message: `Vente de ${formatQty(quantity)} ${ticker} le ${formatDateFR(tx.date)} alors que ${formatQty(current.quantity)} seulement étaient détenus à cette date.`,
                })
            }

            realizedPnL += sellGainEUR
            current.realizedPnLEUR += sellGainEUR
            current.quantity = Math.max(0, current.quantity - matchedQuantity)
            current.costBasisEUR = Math.max(0, current.costBasisEUR - soldCostEUR)
            current.costBasisNative = Math.max(0, current.costBasisNative - soldCostNative)
            totalSoldEUR += proceedsEUR
        }

        if (Math.abs(current.quantity) < EPSILON) {
            current.quantity = 0
            current.costBasisEUR = 0
            current.costBasisNative = 0
        }
        if (tx.name && String(tx.name).trim()) current.name = String(tx.name).trim()
        if (hasExplicitCurrency) {
            current.currency = currency
            current.currencyWasExplicit = true
        }
        positionsMap.set(ticker, current)
    }

    return {
        rawPositions: [...positionsMap.values()],
        realizedPnL,
        totalFees,
        totalBoughtEUR,
        totalSoldEUR,
        dividendsGrossEUR,
        dividendsNetEUR,
        dataIssues: oversellIssues,
        dataWarnings,
    }
}

export function enrichPositions(rawPositions, prices, currencies = {}, currentRates = 1.085) {
    const activePositions = rawPositions.filter((item) => item.quantity > EPSILON)
    const totalsByCurrency = new Map()
    let totalValueEUR = 0
    const enriched = activePositions.map((item) => {
        const currency = normalizeCurrency(item.currencyWasExplicit ? item.currency : (currencies[item.ticker] || item.currency), item.ticker)
        const currentPriceNative = parseNumber(prices[item.ticker], 0) || (item.quantity > 0 ? item.costBasisNative / item.quantity : 0)
        const hasLivePrice = parseNumber(prices[item.ticker], 0) > 0
        const rate = exchangeRateFor(currency, currentRates)
        const averageCostNative = item.quantity > 0 ? item.costBasisNative / item.quantity : 0
        const averageCostEUR = item.quantity > 0 ? item.costBasisEUR / item.quantity : 0
        const currentPriceEUR = currentPriceNative / rate
        const marketValueEUR = currentPriceEUR * item.quantity
        const marketValueNative = currentPriceNative * item.quantity
        totalValueEUR += marketValueEUR
        totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + marketValueNative)
        const unrealizedPnLEUR = marketValueEUR - item.costBasisEUR
        const unrealizedPnLNative = marketValueNative - item.costBasisNative
        const unrealizedPctNative = item.costBasisNative > 0 ? unrealizedPnLNative / item.costBasisNative * 100 : 0
        const unrealizedPct = item.costBasisEUR > 0 ? (unrealizedPnLEUR / item.costBasisEUR) * 100 : 0
        return {
            ...item,
            currency,
            currentPrice: currentPriceNative,
            currentPriceEUR,
            hasLivePrice,
            averageCost: averageCostNative,
            averageCostEUR,
            costBasis: item.costBasisEUR,
            costBasisNative: item.costBasisNative,
            marketValue: marketValueEUR,
            marketValueNative,
            unrealizedPnL: unrealizedPnLEUR,
            unrealizedPnLNative,
            unrealizedPctNative,
            unrealizedPct,
        }
    })

    return enriched
        .map((position) => ({
            ...position,
            allocationWeight: (totalsByCurrency.get(position.currency) || 0) > 0 ? (position.marketValueNative / totalsByCurrency.get(position.currency)) * 100 : 0,
            allocationWeightEUR: totalValueEUR > 0 ? (position.marketValue / totalValueEUR) * 100 : 0,
        }))
        .sort((a, b) => b.marketValue - a.marketValue)
}

export function computePortfolio(transactions = [], prices = {}, currencies = {}, currentRates = 1.085) {
    const accounting = buildPositions(transactions, currentRates)
    const positions = enrichPositions(accounting.rawPositions, prices, currencies, currentRates)
    const invested = positions.reduce((sum, item) => sum + item.costBasis, 0)
    const currentValue = positions.reduce((sum, item) => sum + item.marketValue, 0)
    const unrealizedPnL = currentValue - invested
    const unrealizedPct = invested > 0 ? (unrealizedPnL / invested) * 100 : 0
    const totalPnL = unrealizedPnL + accounting.realizedPnL + accounting.dividendsNetEUR
    const totalPnLPct = accounting.totalBoughtEUR > 0 ? (totalPnL / accounting.totalBoughtEUR) * 100 : 0
    const sortedByPct = [...positions].sort((a, b) => b.unrealizedPct - a.unrealizedPct)
    const currentFxWarnings = positions
        .filter((position) => !hasExchangeRate(position.currency, currentRates))
        .map((position) => `Taux de change actuel indisponible pour ${position.ticker} (${position.currency}); sa valeur est estimée sans conversion.`)

    return {
        positions,
        invested,
        currentValue,
        unrealizedPnL,
        unrealizedPct,
        realizedPnL: accounting.realizedPnL,
        dividendsGross: accounting.dividendsGrossEUR,
        dividendsNet: accounting.dividendsNetEUR,
        totalBought: accounting.totalBoughtEUR,
        totalSold: accounting.totalSoldEUR,
        totalPnL,
        totalPnLPct,
        totalFees: accounting.totalFees,
        transactionCount: transactions.length,
        topPerformer: sortedByPct[0] || null,
        worstPerformer: sortedByPct[sortedByPct.length - 1] || null,
        dataIssues: accounting.dataIssues,
        dataWarnings: [...new Set([...accounting.dataWarnings, ...currentFxWarnings])],
    }
}
