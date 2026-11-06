import { fetchYahooChart, jsonResponse, quoteFromChart } from '../api-lib/yahoo.js'

export default async function handler(req, res) {
    if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' })
    const symbols = String(req.query.symbols || '').split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
    if (symbols.length > 50) return jsonResponse(res, 400, { error: 'Maximum 50 symbols per request.' })
    const entries = await Promise.all(symbols.map(async (ticker) => {
        try {
            const quote = quoteFromChart(await fetchYahooChart(ticker), ticker)
            return quote ? [ticker, quote] : null
        } catch {
            return null
        }
    }))
    return jsonResponse(res, 200, Object.fromEntries(entries.filter(Boolean)))
}
