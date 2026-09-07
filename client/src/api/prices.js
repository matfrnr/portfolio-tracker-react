const API_BASE = '/api/prices'

async function handleResponse(response) {
    if (!response.ok) {
        let message = 'Erreur API'
        try {
            const data = await response.json()
            message = data.error || message
        } catch {}
        throw new Error(message)
    }
    if (response.status === 204) return null
    return response.json()
}

export async function getPrices() {
    const response = await fetch(API_BASE)
    return handleResponse(response)
}

export async function updatePrice(ticker, price, currency) {
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticker, price, currency }),
    })
    return handleResponse(response)
}

export async function getForexRate() {
    const response = await fetch('/api/forex')
    return handleResponse(response)
}

export async function fetchLiveQuotes(symbols) {
    if (!symbols || symbols.length === 0) return {}
    const query = Array.isArray(symbols) ? symbols.join(',') : symbols
    const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(query)}`)
    return handleResponse(response)
}

export async function searchTickers(query) {
    if (!query || !query.trim()) return []
    const response = await fetch(`/api/quotes/search?q=${encodeURIComponent(query.trim())}`)
    return handleResponse(response)
}
