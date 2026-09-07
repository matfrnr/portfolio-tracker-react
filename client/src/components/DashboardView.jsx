import { useMemo } from 'react'
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    ReferenceLine,
} from 'recharts'
import { formatCurrency, formatPercent, formatQty } from '../lib/portfolio'
import {
    PieChart as PieIcon,
    BarChart3,
    TrendingUp,
    TrendingDown,
    Award,
    AlertCircle,
    ShieldCheck,
    Coins,
    Briefcase,
} from 'lucide-react'

const PALETTE = [
    '#3b82f6', // Bleu vif
    '#10b981', // Émeraude
    '#f59e0b', // Ambre
    '#8b5cf6', // Violet
    '#ec4899', // Rose
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#14b8a6', // Sarcelle
]

// Tooltip personnalisé pour le Donut
function CustomPieTooltip({ active, payload }) {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        return (
            <div className="chart-tooltip">
                <div className="tooltip-header">
                    <span className="tooltip-ticker">{data.ticker}</span>
                    <span className="tooltip-name">{data.name}</span>
                </div>
                <div className="tooltip-row">
                    <span>Valeur actuelle :</span>
                    <strong>{formatCurrency(data.marketValue)}</strong>
                </div>
                <div className="tooltip-row">
                    <span>Part du portefeuille :</span>
                    <strong>{formatPercent(data.allocationWeight)}</strong>
                </div>
                <div className="tooltip-row">
                    <span>Investi (PRU) :</span>
                    <span>{formatCurrency(data.costBasis)}</span>
                </div>
            </div>
        )
    }
    return null
}

// Tooltip personnalisé pour le BarChart
function CustomBarTooltip({ active, payload }) {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        const isPos = data.unrealizedPnL >= 0
        return (
            <div className="chart-tooltip">
                <div className="tooltip-header">
                    <span className="tooltip-ticker">{data.ticker}</span>
                    <span className="tooltip-name">{data.name}</span>
                </div>
                <div className="tooltip-row">
                    <span>Gain / Perte :</span>
                    <strong className={isPos ? 'text-success' : 'text-danger'}>
                        {formatCurrency(data.unrealizedPnL)} ({formatPercent(data.unrealizedPct, true)})
                    </strong>
                </div>
                <div className="tooltip-row">
                    <span>Cours actuel :</span>
                    <span>{formatCurrency(data.currentPrice)}</span>
                </div>
                <div className="tooltip-row">
                    <span>PRU d'achat :</span>
                    <span>{formatCurrency(data.averageCost)}</span>
                </div>
            </div>
        )
    }
    return null
}

export default function DashboardView({ snapshot }) {
    const { positions, invested, currentValue, unrealizedPnL, realizedPnL, totalPnL, totalFees, topPerformer, worstPerformer } =
        snapshot

    const chartData = useMemo(() => {
        return positions.map((p, index) => ({
            ...p,
            color: PALETTE[index % PALETTE.length],
        }))
    }, [positions])

    const pnlData = useMemo(() => {
        return [...positions]
            .sort((a, b) => b.unrealizedPnL - a.unrealizedPnL)
            .map((p) => ({
                ticker: p.ticker,
                name: p.name,
                unrealizedPnL: Number(p.unrealizedPnL.toFixed(2)),
                unrealizedPct: p.unrealizedPct,
                currentPrice: p.currentPrice,
                averageCost: p.averageCost,
            }))
    }, [positions])

    const totalReturnPct = invested > 0 ? (totalPnL / invested) * 100 : 0

    return (
        <div className="dashboard-grid">
            {/* Graphique de répartition du portefeuille */}
            <div className="card dashboard-card">
                <div className="card-header-flex">
                    <div>
                        <h3 className="card-title">
                            <PieIcon size={16} /> Répartition du portefeuille
                        </h3>
                        <p className="card-subtitle">Allocation par actif en fonction de la valeur marchande.</p>
                    </div>
                </div>

                {positions.length === 0 ? (
                    <div className="empty-state chart-empty">
                        <p>Aucune position active pour générer le graphique de répartition.</p>
                    </div>
                ) : (
                    <div className="donut-chart-container">
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={65}
                                        outerRadius={95}
                                        paddingAngle={3}
                                        dataKey="marketValue"
                                        nameKey="ticker"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip content={<CustomPieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Légende personnalisée et propre */}
                        <div className="custom-legend-grid">
                            {chartData.map((pos) => (
                                <div key={pos.ticker} className="legend-item">
                                    <span className="legend-dot" style={{ backgroundColor: pos.color }} />
                                    <span className="legend-ticker">{pos.ticker}</span>
                                    <span className="legend-pct">{formatPercent(pos.allocationWeight)}</span>
                                    <span className="legend-val">{formatCurrency(pos.marketValue)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Graphique de Performance par actif */}
            <div className="card dashboard-card">
                <div className="card-header-flex">
                    <div>
                        <h3 className="card-title">
                            <BarChart3 size={16} /> Performance par actif (€)
                        </h3>
                        <p className="card-subtitle">Plus-values et moins-values latentes calculées.</p>
                    </div>
                </div>

                {positions.length === 0 ? (
                    <div className="empty-state chart-empty">
                        <p>Ajoutez des transactions pour comparer les performances de vos positions.</p>
                    </div>
                ) : (
                    <div style={{ width: '100%', height: 260, marginTop: '1rem' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pnlData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="ticker" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                                <RechartsTooltip content={<CustomBarTooltip />} />
                                <ReferenceLine y={0} stroke="var(--border-strong)" />
                                <Bar dataKey="unrealizedPnL" radius={[4, 4, 0, 0]}>
                                    {pnlData.map((entry, index) => (
                                        <Cell
                                            key={`bar-${index}`}
                                            fill={entry.unrealizedPnL >= 0 ? '#10b981' : '#ef4444'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Cartes de synthèse financière détaillée */}
            <div className="card dashboard-card full-span">
                <h3 className="card-title">
                    <ShieldCheck size={16} /> Synthèse financière
                </h3>

                <div className="financial-summary-grid">
                    <div className="summary-stat-box">
                        <div className="stat-icon-wrapper blue">
                            <Briefcase size={20} />
                        </div>
                        <div>
                            <span className="stat-label">Total investi (Capital)</span>
                            <div className="stat-val">{formatCurrency(invested)}</div>
                            <span className="stat-desc">Prix de revient unitaire total</span>
                        </div>
                    </div>

                    <div className="summary-stat-box">
                        <div className="stat-icon-wrapper green">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <span className="stat-label">Valeur actuelle</span>
                            <div className="stat-val">{formatCurrency(currentValue)}</div>
                            <span className="stat-desc">Valorisation au cours du marché</span>
                        </div>
                    </div>

                    <div className="summary-stat-box">
                        <div className={`stat-icon-wrapper ${unrealizedPnL >= 0 ? 'green' : 'red'}`}>
                            {unrealizedPnL >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        </div>
                        <div>
                            <span className="stat-label">Plus-value latente</span>
                            <div className={`stat-val ${unrealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatCurrency(unrealizedPnL)}
                            </div>
                            <span className="stat-desc">{formatPercent(invested > 0 ? (unrealizedPnL / invested) * 100 : 0, true)} sur les positions ouvertes</span>
                        </div>
                    </div>

                    <div className="summary-stat-box">
                        <div className="stat-icon-wrapper purple">
                            <Coins size={20} />
                        </div>
                        <div>
                            <span className="stat-label">Plus-value réalisée</span>
                            <div className={`stat-val ${realizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatCurrency(realizedPnL)}
                            </div>
                            <span className="stat-desc">Gains nets matérialisés par vente</span>
                        </div>
                    </div>

                    <div className="summary-stat-box">
                        <div className="stat-icon-wrapper amber">
                            <Award size={20} />
                        </div>
                        <div>
                            <span className="stat-label">Meilleure performance</span>
                            <div className="stat-val">
                                {topPerformer ? `${topPerformer.ticker}` : '—'}
                            </div>
                            <span className="stat-desc text-success">
                                {topPerformer ? formatPercent(topPerformer.unrealizedPct, true) : 'Aucun titre'}
                            </span>
                        </div>
                    </div>

                    <div className="summary-stat-box">
                        <div className="stat-icon-wrapper red">
                            <AlertCircle size={20} />
                        </div>
                        <div>
                            <span className="stat-label">Moins bonne performance</span>
                            <div className="stat-val">
                                {worstPerformer ? `${worstPerformer.ticker}` : '—'}
                            </div>
                            <span className="stat-desc text-danger">
                                {worstPerformer ? formatPercent(worstPerformer.unrealizedPct, true) : 'Aucun titre'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}