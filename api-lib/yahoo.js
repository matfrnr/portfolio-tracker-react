const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/'
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioTracker/1.0)' }

export async function fetchYahooChart(symbol, params = 'interval=1d&range=1d', timeoutMs = 5000) {
    const response = await fetch(`${YAHOO_CHART}${encodeURIComponent(symbol)}?${params}`, {
        headers: YAHOO_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`)
    const result = (await response.json())?.chart?.result?.[0]
    if (!result) throw new Error('No quote data')
    return result
}

export function quoteFromChart(result, ticker) {
    const meta = result.meta || {}
    const price = Number(meta.regularMarketPrice)
    if (!(price > 0)) return null
    const previousClose = Number(meta.chartPreviousClose) || price
    const change = price - previousClose
    return {
        price,
        previousClose,
        change,
        changePercent: previousClose > 0 ? change / previousClose * 100 : 0,
        currency: meta.currency || 'EUR',
        name: meta.shortName || meta.longName || ticker,
        isFallback: false,
    }
}

export function jsonResponse(res, status, body) {
    res.status(status).setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    res.json(body)
}
