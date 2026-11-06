import { jsonResponse } from '../api-lib/yahoo.js'

const DEFAULT_CURRENCIES = ['USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'SEK', 'NOK', 'DKK', 'CNY', 'HKD', 'NZD', 'SGD']

export default async function handler(req, res) {
    if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' })
    const requested = typeof req.query.currencies === 'string'
        ? req.query.currencies.split(',').map((value) => value.trim().toUpperCase())
        : DEFAULT_CURRENCIES
    const currencies = [...new Set(['USD', ...requested])].filter((currency) => /^[A-Z]{3}$/.test(currency) && currency !== 'EUR').slice(0, 20)
    const rates = { EUR: 1 }
    const rateUpdatedAt = {}
    await Promise.all(currencies.map(async (currency) => {
        try {
            const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/EUR${currency}%3DX?interval=1d&range=1d`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioTracker/1.0)' },
                signal: AbortSignal.timeout(5000),
            })
            if (!response.ok) return
            const data = await response.json()
            const rate = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice)
            if (rate > 0) {
                rates[currency] = rate
                rateUpdatedAt[currency] = new Date().toISOString()
            }
        } catch {}
    }))
    const EURUSD = rates.USD
    return jsonResponse(res, 200, {
        ...(EURUSD ? { EURUSD, USDEUR: 1 / EURUSD } : {}),
        rates,
        rateUpdatedAt,
        updatedAt: new Date().toISOString(),
    })
}
