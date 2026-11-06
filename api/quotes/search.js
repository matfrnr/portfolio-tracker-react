import { jsonResponse } from '../../api-lib/yahoo.js'

export default async function handler(req, res) {
    if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' })
    const query = String(req.query.q || '').trim().slice(0, 80)
    if (!query) return jsonResponse(res, 200, [])
    try {
        const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioTracker/1.0)' },
            signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) return jsonResponse(res, 200, [])
        const data = await response.json()
        const quotes = (data.quotes || [])
            .filter((quote) => quote.symbol && (quote.shortname || quote.longname))
            .map((quote) => ({
                symbol: quote.symbol,
                name: quote.shortname || quote.longname,
                exchange: quote.exchange || '',
                type: quote.quoteType,
                currency: quote.currency || 'USD',
            }))
        return jsonResponse(res, 200, quotes)
    } catch {
        return jsonResponse(res, 200, [])
    }
}
