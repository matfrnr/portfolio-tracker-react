export function formatCurrency(value, currency = 'EUR') {
    const num = Number(value)
    const curr = currency ? currency.toUpperCase() : 'EUR'
    if (!Number.isFinite(num)) {
        return curr === 'USD' ? '$ 0,00' : '0,00 €'
    }
    try {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: curr,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num)
    } catch {
        return `${num.toFixed(2).replace('.', ',')} ${curr === 'USD' ? '$' : '€'}`
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
    return Number.isInteger(num)
        ? String(num)
        : num.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

export function parseNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
    const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.')
    const parsed = parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
}

export function getTodayISODate() {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function toISODateString(dateVal) {
    if (!dateVal) return getTodayISODate()
    if (typeof dateVal === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal
        if (dateVal.includes('T')) return dateVal.split('T')[0]
    }
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return getTodayISODate()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function formatDateFR(dateVal) {
    if (!dateVal) return ''
    const iso = toISODateString(dateVal)
    const [year, month, day] = iso.split('-')
    return `${day}/${month}/${year}`
}

export function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeTicker(value) {
    return value ? String(value).trim().toUpperCase() : ''
}

export function getAvailableQuantity(transactions, ticker, excludeTxId = null) {
    const symbol = normalizeTicker(ticker)
    if (!symbol) return 0

    let available = 0
    for (const tx of transactions) {
        if (excludeTxId && tx.id === excludeTxId) continue
        if (normalizeTicker(tx.ticker) !== symbol) continue

        const qty = parseNumber(tx.quantity, 0)
        if (tx.type === 'BUY') {
            available += qty
        } else if (tx.type === 'SELL') {
            available -= qty
        }
    }

    return Math.max(0, available)
}

export function validateTransaction(form, transactions = [], excludeTxId = null) {
    const ticker = normalizeTicker(form.ticker)
    const quantity = parseNumber(form.quantity, 0)
    const unitPrice = parseNumber(form.unitPrice, 0)
    const fees = parseNumber(form.fees, 0)

    if (!ticker) return 'Le ticker est obligatoire.'
    if (!form.date) return 'La date est obligatoire.'
    if (quantity <= 0) {
        return 'La quantité doit être supérieure à 0.'
    }
    if (unitPrice <= 0) {
        return 'Le prix unitaire doit être supérieur à 0.'
    }
    if (fees < 0) {
        return 'Les frais ne peuvent pas être négatifs.'
    }

    if (form.type === 'SELL') {
        const available = getAvailableQuantity(transactions, ticker, excludeTxId)
        if (quantity > available + 1e-6) {
            return `Vente impossible : vous ne détenez actuellement que ${formatQty(
                available,
            )} ${ticker} (quantité demandée : ${formatQty(quantity)}).`
        }
    } else if (form.type === 'BUY' && excludeTxId) {
        let totalBoughtWithoutThis = 0
        let totalSold = 0
        for (const tx of transactions) {
            if (normalizeTicker(tx.ticker) !== ticker) continue
            if (tx.id === excludeTxId) continue
            if (tx.type === 'BUY') totalBoughtWithoutThis += parseNumber(tx.quantity, 0)
            else if (tx.type === 'SELL') totalSold += parseNumber(tx.quantity, 0)
        }
        if (totalBoughtWithoutThis + quantity < totalSold - 1e-6) {
            const minAllowed = Math.max(0, totalSold - totalBoughtWithoutThis)
            return `Modification impossible : vos ventes passées nécessitent au minimum ${formatQty(minAllowed)} ${ticker}.`
        }
    }

    return null
}

function sortTransactionsByDate(transactions) {
    return [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function buildPositions(transactions, currentForexRate = 1.085) {
    const positionsMap = new Map()
    let realizedPnL = 0
    let totalFees = 0

    const rate = currentForexRate && currentForexRate > 0 ? currentForexRate : 1.085

    for (const tx of sortTransactionsByDate(transactions)) {
        const ticker = normalizeTicker(tx.ticker)
        if (!ticker) continue

        const currency = tx.currency === 'USD' ? 'USD' : (tx.ticker.endsWith('.PA') ? 'EUR' : 'USD')
        const txRate = tx.exchangeRate && tx.exchangeRate > 0 ? tx.exchangeRate : (currency === 'USD' ? rate : 1.0)

        const current = positionsMap.get(ticker) || {
            ticker,
            name: tx.name ? String(tx.name).trim() : ticker,
            currency,
            quantity: 0,
            costBasisNative: 0,
            costBasisEUR: 0,
            realizedPnLEUR: 0,
            totalBought: 0,
            totalSold: 0,
            totalInvestedEUR: 0,
        }

        const quantity = parseNumber(tx.quantity, 0)
        const unitPrice = parseNumber(tx.unitPrice, 0)
        const fees = parseNumber(tx.fees, 0)

        // Frais convertis en EUR
        const feesEUR = currency === 'USD' ? fees / txRate : fees
        totalFees += feesEUR

        if (tx.type === 'BUY') {
            current.quantity += quantity
            const buyCostNative = quantity * unitPrice + fees
            const buyCostEUR = currency === 'USD' ? buyCostNative / txRate : buyCostNative

            current.costBasisNative += buyCostNative
            current.costBasisEUR += buyCostEUR
            current.totalBought += quantity
            current.totalInvestedEUR += buyCostEUR
        } else if (tx.type === 'SELL') {
            current.totalSold += quantity
            const proceedsNative = quantity * unitPrice - fees
            const proceedsEUR = currency === 'USD' ? proceedsNative / txRate : proceedsNative

            const avgCostEUR = current.quantity > 0 ? current.costBasisEUR / current.quantity : 0
            const soldCostEUR = avgCostEUR * Math.min(quantity, current.quantity)
            const sellGainEUR = proceedsEUR - soldCostEUR

            const avgCostNative = current.quantity > 0 ? current.costBasisNative / current.quantity : 0
            const soldCostNative = avgCostNative * Math.min(quantity, current.quantity)

            realizedPnL += sellGainEUR
            current.realizedPnLEUR += sellGainEUR

            current.quantity = Math.max(0, current.quantity - quantity)
            current.costBasisEUR = Math.max(0, current.costBasisEUR - soldCostEUR)
            current.costBasisNative = Math.max(0, current.costBasisNative - soldCostNative)
        }

        if (Math.abs(current.quantity) < 1e-6) {
            current.quantity = 0
            current.costBasisEUR = 0
            current.costBasisNative = 0
        }

        if (tx.name && String(tx.name).trim()) {
            current.name = String(tx.name).trim()
        }
        if (tx.currency) {
            current.currency = tx.currency
        }

        positionsMap.set(ticker, current)
    }

    return {
        rawPositions: [...positionsMap.values()],
        realizedPnL,
        totalFees,
    }
}

export function enrichPositions(rawPositions, prices, currencies = {}, currentForexRate = 1.085) {
    const activePositions = rawPositions.filter((item) => item.quantity > 1e-6)
    const rate = currentForexRate && currentForexRate > 0 ? currentForexRate : 1.085

    let tempTotalValueEUR = 0

    const enriched = activePositions.map((item) => {
        const currency = item.currency || currencies[item.ticker] || (item.ticker.endsWith('.PA') ? 'EUR' : 'USD')
        const savedPrice = parseNumber(prices[item.ticker], 0)

        const averageCostNative = item.quantity > 0 ? item.costBasisNative / item.quantity : 0
        const averageCostEUR = item.quantity > 0 ? item.costBasisEUR / item.quantity : 0
        const currentPriceNative = savedPrice > 0 ? savedPrice : averageCostNative
        const hasLivePrice = savedPrice > 0

        // Cours et valorisation en EUR pour consolidation du portefeuille
        const currentPriceEUR = currency === 'USD' ? currentPriceNative / rate : currentPriceNative
        const marketValueEUR = currentPriceEUR * item.quantity
        const marketValueNative = currentPriceNative * item.quantity
        tempTotalValueEUR += marketValueEUR

        const unrealizedPnLEUR = marketValueEUR - item.costBasisEUR
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
            unrealizedPct,
        }
    })

    return enriched
        .map((pos) => ({
            ...pos,
            allocationWeight: tempTotalValueEUR > 0 ? (pos.marketValue / tempTotalValueEUR) * 100 : 0,
        }))
        .sort((a, b) => b.marketValue - a.marketValue)
}

export function computePortfolio(transactions = [], prices = {}, currencies = {}, currentForexRate = 1.085) {
    const { rawPositions, realizedPnL, totalFees } = buildPositions(transactions, currentForexRate)
    const positions = enrichPositions(rawPositions, prices, currencies, currentForexRate)

    const invested = positions.reduce((sum, item) => sum + item.costBasis, 0)
    const currentValue = positions.reduce((sum, item) => sum + item.marketValue, 0)
    const unrealizedPnL = currentValue - invested
    const unrealizedPct = invested > 0 ? (unrealizedPnL / invested) * 100 : 0
    const totalPnL = unrealizedPnL + realizedPnL
    const totalPnLPct = invested > 0 ? (totalPnL / invested) * 100 : 0

    let topPerformer = null
    let worstPerformer = null

    if (positions.length > 0) {
        const sortedByPct = [...positions].sort((a, b) => b.unrealizedPct - a.unrealizedPct)
        topPerformer = sortedByPct[0]
        worstPerformer = sortedByPct[sortedByPct.length - 1]
    }

    return {
        positions,
        invested,
        currentValue,
        unrealizedPnL,
        unrealizedPct,
        realizedPnL,
        totalPnL,
        totalPnLPct,
        totalFees,
        transactionCount: transactions.length,
        topPerformer,
        worstPerformer,
    }
}
