import { supabase } from '../lib/supabase'

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/prices`

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
    if (supabase) {
        const { data, error } = await supabase.from('asset_prices').select('ticker,current_price,currency')
        if (error) throw error
        return {
            prices: Object.fromEntries((data || []).map((row) => [row.ticker, row.current_price])),
            currencies: Object.fromEntries((data || []).map((row) => [row.ticker, row.currency])),
        }
    }
    const response = await fetch(API_BASE)
    return handleResponse(response)
}

export async function updatePrice(ticker, price, currency) {
    if (supabase) return savePrices({ [String(ticker).toUpperCase()]: price }, { [String(ticker).toUpperCase()]: currency })
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticker, price, currency }),
    })
    return handleResponse(response)
}

export async function savePrices(prices, currencies = {}) {
    if (!supabase) {
        const entries = Object.entries(prices || {})
        return Promise.all(entries.map(([ticker, price]) => updatePrice(ticker, price, currencies[ticker])))
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) {
        const error = new Error('Connecte-toi pour enregistrer les cours.')
        error.status = 401
        throw error
    }
    const rows = Object.entries(prices || {}).map(([ticker, price]) => ({
        user_id: user.id,
        ticker: String(ticker).trim().toUpperCase(),
        current_price: Number(price),
        currency: currencies[ticker] || 'EUR',
        updated_at: new Date().toISOString(),
    })).filter((row) => row.current_price > 0)
    if (!rows.length) return []
    const { data, error } = await supabase.from('asset_prices').upsert(rows, { onConflict: 'user_id,ticker' }).select()
    if (error) throw error
    return data
}

export async function getForexRate(currencies = []) {
    const query = Array.isArray(currencies) && currencies.length
        ? `?currencies=${encodeURIComponent(currencies.join(','))}`
        : ''
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/forex${query}`)
    return handleResponse(response)
}

export async function fetchLiveQuotes(symbols) {
    if (!symbols || symbols.length === 0) return {}
    const list = (Array.isArray(symbols) ? symbols : String(symbols).split(',')).map((symbol) => String(symbol).trim()).filter(Boolean)
    const batches = []
    for (let index = 0; index < list.length; index += 50) batches.push(list.slice(index, index + 50))
    const results = await Promise.all(batches.map(async (batch) => {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/quotes?symbols=${encodeURIComponent(batch.join(','))}`)
        return handleResponse(response)
    }))
    return Object.assign({}, ...results)
}

export async function fetchDividends(symbols) {
    if (!symbols || symbols.length === 0) return {}
    const list = (Array.isArray(symbols) ? symbols : String(symbols).split(',')).map((symbol) => String(symbol).trim()).filter(Boolean)
    const batches = []
    for (let index = 0; index < list.length; index += 50) batches.push(list.slice(index, index + 50))
    const results = await Promise.all(batches.map(async (batch) => {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/dividends?symbols=${encodeURIComponent(batch.join(','))}`)
        return handleResponse(response)
    }))
    return Object.assign({}, ...results)
}

export async function searchTickers(query) {
    if (!query || !query.trim()) return []
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/quotes/search?q=${encodeURIComponent(query.trim())}`)
    return handleResponse(response)
}
