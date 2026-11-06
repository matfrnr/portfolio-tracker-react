import { fetchYahooChart, jsonResponse } from '../api-lib/yahoo.js'

export default async function handler(req, res) {
    if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' })
    const symbols = [...new Set(String(req.query.symbols || '').split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
    if (symbols.length > 50) return jsonResponse(res, 400, { error: 'Maximum 50 symbols per request.' })
    const cutoff = Math.floor((Date.now() - 365.25 * 86400000) / 1000)
    const now = Math.floor(Date.now() / 1000)
    const entries = await Promise.all(symbols.map(async (ticker) => {
        try {
            const result = await fetchYahooChart(ticker, 'interval=1mo&range=5y&events=dividends')
            const dividendPerShare = Object.values(result.events?.dividends || {})
                .filter((event) => Number(event.date) >= cutoff && Number(event.date) <= now)
                .reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
            return [ticker, {
                dividendPerShare,
                currency: result.meta?.currency || 'EUR',
                source: 'Yahoo Finance',
                asOf: new Date().toISOString(),
            }]
        } catch {
            return null
        }
    }))
    return jsonResponse(res, 200, Object.fromEntries(entries.filter(Boolean)))
}
