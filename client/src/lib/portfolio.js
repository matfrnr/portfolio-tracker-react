export function formatCurrency(value, currency = 'EUR') {
    const num = Number(value)
    if (!Number.isFinite(num)) return '0,00 €'
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num)
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

export function toISODateString(dateVal) {
    if (!dateVal) return new Date().toISOString().split('T')[0]
    if (typeof dateVal === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal
        if (dateVal.includes('T')) return dateVal.split('T')[0]
    }
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0]
    return d.toISOString().split('T')[0]
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

        const qty = Number(tx.quantity || 0)
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
    const quantity = Number(form.quantity)
    const unitPrice = Number(form.unitPrice)
    const fees = Number(form.fees || 0)

    if (!ticker) return 'Le ticker est obligatoire.'
    if (!form.date) return 'La date est obligatoire.'
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return 'La quantité doit être supérieure à 0.'
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return 'Le prix unitaire doit être supérieur à 0.'
    }
    if (!Number.isFinite(fees) || fees < 0) {
        return 'Les frais ne peuvent pas être négatifs.'
    }

    if (form.type === 'SELL') {
        const available = getAvailableQuantity(transactions, ticker, excludeTxId)
        if (quantity > available + 1e-6) {
            return `Vente impossible : vous ne détenez actuellement que ${formatQty(
                available,
            )} ${ticker} (quantité demandée : ${formatQty(quantity)}).`
        }
    }

    return null
}

function sortTransactionsByDate(transactions) {
    return [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function buildPositions(transactions) {
    const positionsMap = new Map()
    let realizedPnL = 0
    let totalFees = 0

    for (const tx of sortTransactionsByDate(transactions)) {
        const ticker = normalizeTicker(tx.ticker)
        if (!ticker) continue

        const current = positionsMap.get(ticker) || {
            ticker,
            name: tx.name ? String(tx.name).trim() : ticker,
            quantity: 0,
            costBasis: 0,
            realizedPnL: 0,
            totalBought: 0,
            totalSold: 0,
            totalInvested: 0,
        }

        const quantity = Number(tx.quantity || 0)
        const unitPrice = Number(tx.unitPrice || 0)
        const fees = Number(tx.fees || 0)

        totalFees += fees

        if (tx.type === 'BUY') {
            current.quantity += quantity
            const buyCost = quantity * unitPrice + fees
            current.costBasis += buyCost
            current.totalBought += quantity
            current.totalInvested += buyCost
        } else if (tx.type === 'SELL') {
            current.totalSold += quantity
            const proceeds = quantity * unitPrice - fees
            const avgCost = current.quantity > 0 ? current.costBasis / current.quantity : 0
            const soldCost = avgCost * Math.min(quantity, current.quantity)
            const sellGain = proceeds - soldCost

            realizedPnL += sellGain
            current.realizedPnL += sellGain

            current.quantity = Math.max(0, current.quantity - quantity)
            current.costBasis = Math.max(0, current.costBasis - soldCost)
        }

        // Éliminer les résidus d'arrondi flottant
        if (Math.abs(current.quantity) < 1e-6) {
            current.quantity = 0
            current.costBasis = 0
        }

        if (tx.name && String(tx.name).trim()) {
            current.name = String(tx.name).trim()
        }

        positionsMap.set(ticker, current)
    }

    return {
        rawPositions: [...positionsMap.values()],
        realizedPnL,
        totalFees,
    }
}

export function enrichPositions(rawPositions, prices) {
    const activePositions = rawPositions.filter((item) => item.quantity > 1e-6)

    // Calcul provisoire pour la valeur totale
    let tempTotalValue = 0

    const enriched = activePositions.map((item) => {
        const savedPrice = Number(prices[item.ticker] || 0)
        const averageCost = item.quantity > 0 ? item.costBasis / item.quantity : 0
        // Si aucun cours n'est renseigné, utiliser le PRU pour ne pas afficher une fausse perte de 100%
        const currentPrice = savedPrice > 0 ? savedPrice : averageCost
        const hasLivePrice = savedPrice > 0

        const marketValue = currentPrice * item.quantity
        tempTotalValue += marketValue
        const unrealizedPnL = marketValue - item.costBasis
        const unrealizedPct = item.costBasis > 0 ? (unrealizedPnL / item.costBasis) * 100 : 0

        return {
            ...item,
            currentPrice,
            hasLivePrice,
            averageCost,
            marketValue,
            unrealizedPnL,
            unrealizedPct,
        }
    })

    // Ajouter le poids d'allocation
    return enriched
        .map((pos) => ({
            ...pos,
            allocationWeight: tempTotalValue > 0 ? (pos.marketValue / tempTotalValue) * 100 : 0,
        }))
        .sort((a, b) => b.marketValue - a.marketValue)
}

export function computePortfolio(transactions = [], prices = {}) {
    const { rawPositions, realizedPnL, totalFees } = buildPositions(transactions)
    const positions = enrichPositions(rawPositions, prices)

    const invested = positions.reduce((sum, item) => sum + item.costBasis, 0)
    const currentValue = positions.reduce((sum, item) => sum + item.marketValue, 0)
    const unrealizedPnL = currentValue - invested
    const unrealizedPct = invested > 0 ? (unrealizedPnL / invested) * 100 : 0
    const totalPnL = unrealizedPnL + realizedPnL
    const totalPnLPct = invested > 0 ? (totalPnL / invested) * 100 : 0

    // Positions avec les meilleures et moins bonnes performances
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
