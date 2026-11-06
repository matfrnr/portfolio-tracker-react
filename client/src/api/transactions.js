import { supabase } from '../lib/supabase'

const API_BASE = '/api/transactions'

async function handleResponse(response) {
  if (!response.ok) {
    let message = 'Erreur API'
    try {
      const data = await response.json()
      message = data.error || message
    } catch {}
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  if (response.status === 204) return null
  return response.json()
}

function throwSupabaseError(error) {
  const wrapped = new Error(error?.message || 'Erreur Supabase')
  wrapped.status = error?.status || 500
  throw wrapped
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throwSupabaseError(error)
  if (!data?.user?.id) {
    const authError = new Error('Connecte-toi pour accéder à tes transactions.')
    authError.status = 401
    throw authError
  }
  return data.user.id
}

function fromDatabase(row) {
  return {
    id: row.id,
    type: row.type,
    ticker: row.ticker,
    name: row.name,
    date: row.date,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    fees: row.fees,
    note: row.note,
    currency: row.currency,
    exchangeRate: row.exchange_rate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDatabase(transaction, userId) {
  return {
    id: transaction.id || globalThis.crypto.randomUUID(),
    user_id: userId,
    type: transaction.type,
    ticker: String(transaction.ticker || '').trim().toUpperCase(),
    name: transaction.name || transaction.ticker,
    date: new Date(transaction.date).toISOString(),
    quantity: Number(transaction.quantity),
    unit_price: Number(transaction.unitPrice),
    fees: Number(transaction.fees || 0),
    note: transaction.note || null,
    currency: transaction.currency || 'EUR',
    exchange_rate: Number(transaction.exchangeRate || 1),
    ...(transaction.createdAt ? { created_at: transaction.createdAt } : {}),
  }
}

export async function getTransactions() {
  if (!supabase) {
    return handleResponse(await fetch(API_BASE))
  }
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throwSupabaseError(error)
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows.map(fromDatabase)
}

export async function createTransaction(payload) {
  if (!supabase) {
    return handleResponse(await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
  }
  const userId = await getCurrentUserId()
  const { data, error } = await supabase.from('transactions').insert(toDatabase(payload, userId)).select('*').single()
  if (error) throwSupabaseError(error)
  return fromDatabase(data)
}

export async function updateTransaction(id, payload) {
  if (!supabase) {
    return handleResponse(await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
  }
  const userId = await getCurrentUserId()
  const update = toDatabase({ ...payload, id }, userId)
  delete update.user_id
  delete update.created_at
  const { data, error } = await supabase.from('transactions').update(update).eq('id', id).select('*').maybeSingle()
  if (error) throwSupabaseError(error)
  if (!data) {
    const missing = new Error('Transaction introuvable.')
    missing.status = 404
    throw missing
  }
  return fromDatabase(data)
}

export async function deleteTransaction(id) {
  if (!supabase) {
    return handleResponse(await fetch(`${API_BASE}/${id}`, { method: 'DELETE' }))
  }
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throwSupabaseError(error)
  return null
}

export async function bulkImportTransactions(transactions, prices = {}, currencies = {}, replace = false, replacePrices = false) {
  if (!supabase) {
    return handleResponse(await fetch(`${API_BASE}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions, prices, currencies, replace, replacePrices }),
    }))
  }
  const userId = await getCurrentUserId()
  const { error } = await supabase.rpc('import_portfolio', {
    p_transactions: transactions.map((transaction) => toDatabase(transaction, userId)),
    p_prices: prices,
    p_currencies: currencies,
    p_replace: replace,
    p_replace_prices: replacePrices,
  })
  if (error) throwSupabaseError(error)
  return { success: true, transactions: await getTransactions() }
}
