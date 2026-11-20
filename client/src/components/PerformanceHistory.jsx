import { useEffect, useMemo, useState } from 'react'
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { Activity } from 'lucide-react'
import { getPerformanceSnapshots } from '../api/snapshots'
import { formatCurrency } from '../lib/portfolio'

const PERIODS = [
    { id: '7d', label: '1 sem.' },
    { id: '30d', label: '1 mois' },
    { id: 'ytd', label: 'Depuis janvier' },
    { id: '1y', label: '1 an' },
    { id: 'all', label: 'Tout' },
]
const HISTORY_START_DATE = '2026-11-20'

function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseLocalDate(dateKey) {
    return new Date(`${dateKey}T00:00:00`)
}

function periodStart(period, today) {
    const start = new Date(today)
    if (period === 'ytd') return new Date(today.getFullYear(), 0, 1)
    const days = period === '7d' ? 6 : period === '30d' ? 29 : period === '1y' ? 364 : null
    if (days === null) return null
    start.setDate(start.getDate() - days)
    return start
}

function PerformanceTooltip({ active, payload, label }) {
    if (!active || !payload?.length || payload[0].value == null) return null
    const date = parseLocalDate(label).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    return (
        <div className="chart-tooltip">
            <div className="tooltip-header"><span>{date}</span></div>
            <div className="tooltip-row">
                <span>Plus-value latente</span>
                <strong className={payload[0].value >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(payload[0].value, 'EUR')}</strong>
            </div>
        </div>
    )
}

export default function PerformanceHistory({ scope, snapshot, trackingStartedAt = null, saveError = null }) {
    const [period, setPeriod] = useState('30d')
    const [savedSnapshots, setSavedSnapshots] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)

    useEffect(() => {
        let active = true
        setLoading(true)
        setLoadError(null)
        setSavedSnapshots([])
        getPerformanceSnapshots(scope).then((rows) => {
            if (active) setSavedSnapshots(Array.isArray(rows) ? rows : [])
        }).catch((error) => {
            console.warn('Impossible de charger l’historique de performance :', error)
            if (active) setLoadError(error)
        }).finally(() => {
            if (active) setLoading(false)
        })
        return () => { active = false }
    }, [scope])

    const allSnapshots = useMemo(() => {
        const today = localDateKey(new Date())
        const byDate = new Map(savedSnapshots.map((item) => [item.date, item]))
        if (snapshot?.positions?.length > 0 && snapshot.hasTrackedPerformancePositions) {
            byDate.set(today, {
                date: today,
                currentValue: snapshot.currentValue,
                invested: snapshot.invested,
                realizedPnL: snapshot.realizedPnL,
                unrealizedPnL: snapshot.unrealizedPnL,
                dividendsNet: snapshot.dividendsNet,
                totalPnL: snapshot.totalPnL,
                transactionCount: snapshot.transactionCount,
                updatedAt: new Date().toISOString(),
            })
        }
        return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    }, [savedSnapshots, snapshot])

    const historySnapshots = useMemo(() => {
        if (allSnapshots.length === 0) return allSnapshots
        const trackingStart = trackingStartedAt ? new Date(trackingStartedAt) : null
        const trackingDate = trackingStart && Number.isFinite(trackingStart.getTime()) ? localDateKey(trackingStart) : HISTORY_START_DATE
        const effectiveStartDate = trackingDate > HISTORY_START_DATE ? trackingDate : HISTORY_START_DATE
        return allSnapshots.filter((item) => item.date >= effectiveStartDate)
    }, [allSnapshots, trackingStartedAt])

    const visibleSnapshots = useMemo(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const start = periodStart(period, today)
        return historySnapshots.filter((item) => !start || parseLocalDate(item.date) >= start)
    }, [historySnapshots, period])

    const chartData = useMemo(() => {
        if (visibleSnapshots.length < 2) return visibleSnapshots
        const byDate = new Map(visibleSnapshots.map((item) => [item.date, item]))
        const cursor = parseLocalDate(visibleSnapshots[0].date)
        const end = parseLocalDate(visibleSnapshots[visibleSnapshots.length - 1].date)
        const days = []
        while (cursor <= end) {
            const date = localDateKey(cursor)
            const point = byDate.get(date)
            days.push(point ? { ...point, missing: false } : { date, unrealizedPnL: null, missing: true })
            cursor.setDate(cursor.getDate() + 1)
        }
        return days
    }, [visibleSnapshots])

    const firstSnapshot = visibleSnapshots[0]
    const latestSnapshot = visibleSnapshots[visibleSnapshots.length - 1]
    const periodChange = firstSnapshot && latestSnapshot ? latestSnapshot.unrealizedPnL - firstSnapshot.unrealizedPnL : 0
    const periodChangePct = firstSnapshot?.unrealizedPnL > 0
        ? periodChange / firstSnapshot.unrealizedPnL * 100
        : null
    const anyError = saveError || loadError
    const trackingDateValue = trackingStartedAt ? new Date(trackingStartedAt) : null
    const trackingDateKey = trackingDateValue && Number.isFinite(trackingDateValue.getTime()) ? localDateKey(trackingDateValue) : HISTORY_START_DATE
    const chartStartDate = trackingDateKey > HISTORY_START_DATE ? trackingDateKey : HISTORY_START_DATE
    const chartStartDateLabel = parseLocalDate(chartStartDate).toLocaleDateString('fr-FR')
    const subportfolioHistory = scope === 'crypto' || scope === 'savings' || (scope === 'all' && Boolean(trackingStartedAt))
    const chartDomain = useMemo(() => {
        if (!subportfolioHistory || visibleSnapshots.length === 0) return ['auto', 'auto']
        const values = visibleSnapshots.map((item) => Number(item.unrealizedPnL)).filter(Number.isFinite)
        if (values.length === 0) return ['auto', 'auto']
        const min = Math.min(...values)
        const max = Math.max(...values)
        const range = max - min
        const padding = range > 0 ? range * 0.12 : Math.max(Math.abs(min) * 0.08, 25)
        return [min - padding, max + padding]
    }, [subportfolioHistory, visibleSnapshots])
    const showZeroReference = !subportfolioHistory || (chartDomain[0] <= 0 && chartDomain[1] >= 0)

    return (
        <section className="card dashboard-card full-span performance-history-card" aria-labelledby="performance-history-title">
            <div className="card-header-flex performance-history-header">
                <div>
                    <h3 id="performance-history-title" className="card-title"><Activity size={16} /> Historique de la plus-value latente</h3>
                    <p className="card-subtitle">Résultat des positions encore détenues, en euros. Le dernier relevé du jour est conservé.</p>
                </div>
                <div className="performance-history-periods" role="group" aria-label="Période de l’historique">
                    {PERIODS.map((item) => (
                        <button key={item.id} type="button" className={period === item.id ? 'active' : ''} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>
                    ))}
                </div>
            </div>

            {anyError && (
                <div className="performance-history-warning" role="status">
                    Impossible de synchroniser l’historique. Vérifie que la migration Supabase <code>20261119000000_portfolio_snapshots.sql</code> a été exécutée.
                </div>
            )}

            {(
                <div className="performance-history-baseline-note" role="status">
                    Courbe affichée depuis le {chartStartDateLabel}. Les relevés antérieurs sont masqués ; le premier point reprend la plus-value latente réelle du relevé.
                </div>
            )}

            {loading ? (
                <div className="performance-history-empty">Chargement des relevés…</div>
            ) : visibleSnapshots.length === 0 ? (
                <div className="performance-history-empty">{scope === 'savings' ? 'Renseigne ton solde pour commencer l’historique.' : 'Ajoute des transactions pour commencer l’historique.'}</div>
            ) : (
                <>
                    <div className="performance-history-summary">
                        <div>
                            <span className="performance-history-label">Plus-value latente actuelle</span>
                            <strong className={latestSnapshot.unrealizedPnL >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(latestSnapshot.unrealizedPnL, 'EUR')}</strong>
                        </div>
                        {visibleSnapshots.length > 1 && (
                            <div className="performance-history-change">
                                <span className="performance-history-label">Variation sur la période</span>
                                <strong className={periodChange >= 0 ? 'text-success' : 'text-danger'}>
                                    {periodChange > 0 ? '+' : ''}{formatCurrency(periodChange, 'EUR')}
                                    {periodChangePct !== null && <small> ({periodChangePct > 0 ? '+' : ''}{periodChangePct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)</small>}
                                </strong>
                            </div>
                        )}
                    </div>
                    <div className="performance-history-chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(value) => parseLocalDate(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={28}
                                />
                                <YAxis
                                    domain={chartDomain}
                                    width={76}
                                    tickFormatter={(value) => formatCurrency(value, 'EUR')}
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={<PerformanceTooltip />} />
                                {showZeroReference && <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="4 4" />}
                                <Line
                                    type="linear"
                                    dataKey="unrealizedPnL"
                                    name="Plus-value latente"
                                    stroke="#3b82f6"
                                    strokeWidth={2.5}
                                    dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                                    activeDot={{ r: 5 }}
                                    connectNulls={false}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="performance-history-note">
                        {visibleSnapshots.length === 1
                            ? `Premier relevé le ${parseLocalDate(firstSnapshot.date).toLocaleDateString('fr-FR')}. Une nouvelle mesure apparaîtra un autre jour.`
                            : `${visibleSnapshots.length} relevés quotidiens. Les périodes sans mesure restent vides ; la courbe commence à partir du premier relevé enregistré.`}
                        {' '}Un relevé est actualisé à l’ouverture de l’app et après la mise à jour des cours. Les ventes réalisées et les dividendes ne sont pas inclus ; vendre une position fait sortir sa plus-value latente de cette courbe.
                    </p>
                </>
            )}
        </section>
    )
}
