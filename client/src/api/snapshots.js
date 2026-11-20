import { supabase } from '../lib/supabase'

function localKey(scope, userId) {
    return `portfolio-tracker:performance-snapshots:${userId || 'local'}:${scope}`
}

async function currentUserId() {
    if (!supabase) return null
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    return data?.user?.id || null
}

export async function getPerformanceSnapshots(scope) {
    const userId = await currentUserId()
    if (!supabase || !userId) {
        try { return JSON.parse(localStorage.getItem(localKey(scope, userId)) || '[]') } catch { return [] }
    }

    const pageSize = 1000
    const rows = []
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase.from('portfolio_snapshots')
            .select('snapshot_date,current_value,invested,realized_pnl,unrealized_pnl,dividends_net,total_pnl,transaction_count,updated_at')
            .eq('portfolio_scope', scope)
            .order('snapshot_date', { ascending: true })
            .range(from, from + pageSize - 1)
        if (error) throw error
        rows.push(...(data || []))
        if (!data || data.length < pageSize) break
    }
    return rows.map((row) => ({
        date: row.snapshot_date,
        currentValue: Number(row.current_value),
        invested: Number(row.invested),
        realizedPnL: Number(row.realized_pnl),
        unrealizedPnL: Number(row.unrealized_pnl),
        dividendsNet: Number(row.dividends_net),
        totalPnL: Number(row.total_pnl),
        transactionCount: Number(row.transaction_count),
        updatedAt: row.updated_at,
    }))
}

export async function savePerformanceSnapshot(scope, snapshot, date = new Date()) {
    if (!snapshot || !Array.isArray(snapshot.positions) || snapshot.positions.length === 0) return null
    const snapshotDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const row = {
        snapshot_date: snapshotDate,
        portfolio_scope: scope,
        current_value: Number(snapshot.currentValue) || 0,
        invested: Number(snapshot.invested) || 0,
        realized_pnl: Number(snapshot.realizedPnL) || 0,
        unrealized_pnl: Number(snapshot.unrealizedPnL) || 0,
        dividends_net: Number(snapshot.dividendsNet) || 0,
        total_pnl: Number(snapshot.totalPnL) || 0,
        transaction_count: Number(snapshot.transactionCount) || 0,
        updated_at: new Date().toISOString(),
    }

    const userId = await currentUserId()
    if (!supabase || !userId) {
        try {
            const key = localKey(scope, userId)
            const old = JSON.parse(localStorage.getItem(key) || '[]')
            const next = [...old.filter((item) => item.date !== snapshotDate), {
                date: snapshotDate,
                currentValue: row.current_value,
                invested: row.invested,
                realizedPnL: row.realized_pnl,
                unrealizedPnL: row.unrealized_pnl,
                dividendsNet: row.dividends_net,
                totalPnL: row.total_pnl,
                transactionCount: row.transaction_count,
                updatedAt: row.updated_at,
            }].sort((a, b) => a.date.localeCompare(b.date))
            localStorage.setItem(key, JSON.stringify(next))
            return next.at(-1)
        } catch (error) {
            throw error
        }
    }

    const { error } = await supabase.from('portfolio_snapshots').upsert({ ...row, user_id: userId }, { onConflict: 'user_id,snapshot_date,portfolio_scope' })
    if (error) throw error
    return { ...row, date: snapshotDate }
}
