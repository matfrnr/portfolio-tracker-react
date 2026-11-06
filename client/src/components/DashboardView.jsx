import { useEffect, useMemo, useState } from 'react'
import {
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
import { formatCurrency, formatPercent, exchangeRateFor } from '../lib/portfolio'
import { fetchDividends } from '../api/prices'
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

const ASSET_CLASSIFICATION = {
    '2FE.DU': { sector: 'Consommation discrétionnaire', country: 'Italie' },
    '3V64.DE': { sector: 'Finance', country: 'États-Unis' },
    '8JD.F': { sector: 'Santé', country: 'France' },
    'ABEA.DE': { sector: 'Services de communication', country: 'États-Unis' },
    'AMZ.DE': { sector: 'Consommation discrétionnaire', country: 'États-Unis' },
    'DG.PA': { sector: 'Industrie', country: 'France' },
    'FB2A.DE': { sector: 'Services de communication', country: 'États-Unis' },
    'L8IN.DU': { sector: 'ETF diversifié', country: 'États-Unis' },
    'LU3170240538': { sector: 'Capital-investissement', country: 'International / non classé' },
    'MSF.DE': { sector: 'Technologies de l’information', country: 'États-Unis' },
    MSFT: { sector: 'Technologies de l’information', country: 'États-Unis' },
    'NVD.DE': { sector: 'Technologies de l’information', country: 'États-Unis' },
    'TKE.F': { sector: 'Services de communication', country: 'États-Unis' },
    UBER: { sector: 'Industrie', country: 'États-Unis' },
    'VIE.PA': { sector: 'Services aux collectivités', country: 'France' },
    'VU.PA': { sector: 'Technologies de l’information', country: 'France' },
}

// Tooltip personnalisé pour le BarChart
function CustomBarTooltip({ active, payload }) {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        const isPos = data.unrealizedPnL >= 0
        return (
            <div className="chart-tooltip">
                <div className="tooltip-header">
                    <span className="tooltip-ticker">{data.name || data.ticker}</span>
                    <span className="tooltip-name">{data.ticker}</span>
                </div>
                <div className="tooltip-row">
                    <span>Gain / Perte :</span>
                    <strong className={isPos ? 'text-success' : 'text-danger'}>
                        {formatCurrency(data.unrealizedPnL)} ({formatPercent(data.unrealizedPct, true)})
                    </strong>
                </div>
                <div className="tooltip-row">
                    <span>Cours actuel :</span>
                    <span>{formatCurrency(data.currentPrice, data.currency)}</span>
                </div>
                <div className="tooltip-row">
                    <span>PRU d'achat :</span>
                    <span>{formatCurrency(data.averageCost, data.currency)}</span>
                </div>
            </div>
        )
    }
    return null
}

function AssetAxisTick({ x, y, payload, data }) {
    const asset = data.find((item) => item.ticker === payload.value)
    if (!asset) return null
    const name = asset.name || asset.ticker
    const shortName = name.length > 22 ? `${name.slice(0, 21)}…` : name
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={-10} y={-2} textAnchor="end" fill="var(--text-primary)" fontSize={11} fontWeight={600}>{shortName}</text>
            <text x={-10} y={12} textAnchor="end" fill="var(--text-muted)" fontSize={10}>{asset.ticker}</text>
        </g>
    )
}

export default function DashboardView({ snapshot, forexRates = { EUR: 1, USD: 1.085 }, assetMetadata = {} }) {
    const [dividendRates, setDividendRates] = useState({})
    const [allocationMode, setAllocationMode] = useState('asset')
    const { positions, invested, currentValue, unrealizedPnL, realizedPnL, dividendsNet, dataIssues, dataWarnings, topPerformer, worstPerformer } =
        snapshot

    const allocationData = useMemo(() => {
        const groups = new Map()
        for (const position of positions) {
            const classification = ASSET_CLASSIFICATION[position.ticker] || {}
            const metadata = assetMetadata[position.ticker] || {}
            const label = allocationMode === 'asset'
                ? (position.name || position.ticker)
                : allocationMode === 'sector'
                    ? (metadata.sector || classification.sector || 'À classer')
                    : (metadata.country || classification.country || 'À classer')
            const existing = groups.get(label) || { label, marketValue: 0, tickers: [], companies: [], color: PALETTE[groups.size % PALETTE.length] }
            existing.marketValue += Number(position.marketValue) || 0
            existing.tickers.push(position.ticker)
            existing.companies.push(position.name || position.ticker)
            groups.set(label, existing)
        }
        const total = [...groups.values()].reduce((sum, item) => sum + item.marketValue, 0)
        return [...groups.values()]
            .map((item) => ({ ...item, weight: total > 0 ? item.marketValue / total * 100 : 0 }))
            .sort((a, b) => b.marketValue - a.marketValue)
    }, [positions, allocationMode, assetMetadata])

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
                currency: p.currency,
            }))
    }, [positions])
    const gainCount = pnlData.filter((item) => item.unrealizedPnL > 0).length
    const lossCount = pnlData.filter((item) => item.unrealizedPnL < 0).length

    useEffect(() => {
        let active = true
        const symbols = positions.map((position) => position.ticker)
        fetchDividends(symbols).then((rates) => {
            if (active) setDividendRates(rates || {})
        }).catch(() => {
            if (active) setDividendRates({})
        })
        return () => { active = false }
    }, [positions.map((position) => position.ticker).join(',')])

    const dividendForecast = useMemo(() => positions.map((position) => {
        const rate = dividendRates[position.ticker]
        if (!rate) return { ...position, unavailable: true, amountEUR: 0 }
        const amountNative = Number(rate.dividendPerShare || 0) * Number(position.quantity || 0)
        const currency = rate.currency || position.currency || 'EUR'
        return {
            ...position,
            currency,
            dividendPerShare: Number(rate.dividendPerShare || 0),
            amountNative,
            amountEUR: amountNative / exchangeRateFor(currency, forexRates),
            unavailable: false,
        }
    }).sort((a, b) => b.amountEUR - a.amountEUR), [positions, dividendRates, forexRates])
    const dividendTotal = dividendForecast.reduce((sum, item) => sum + item.amountEUR, 0)
    const maxDividend = Math.max(...dividendForecast.map((item) => item.amountEUR), 0)

    return (
        <div className="dashboard-grid">
            <div className="card dashboard-card full-span dividend-forecast-card">
                <div className="card-header-flex">
                    <div>
                        <h3 className="card-title"><Coins size={16} /> Dividendes · référence annuelle</h3>
                        <p className="card-subtitle">Dividende brut par action versé sur les 12 derniers mois × quantité actuellement détenue.</p>
                    </div>
                    <strong className="dividend-forecast-total">{formatCurrency(dividendTotal, 'EUR')}</strong>
                </div>
                {dividendForecast.length === 0 ? (
                    <p className="dividend-forecast-empty">Aucune position à afficher.</p>
                ) : (
                    <div className="dividend-forecast-list">
                        {dividendForecast.map((item) => (
                            <div className="dividend-forecast-row" key={item.ticker}>
                                <div className="dividend-forecast-label"><strong>{item.name || item.ticker}</strong><span>{item.ticker}</span></div>
                                <div className="dividend-forecast-bar"><span style={{ width: `${maxDividend && item.amountEUR > 0 ? Math.max(2, item.amountEUR / maxDividend * 100) : 0}%` }} /></div>
                                <strong>{item.unavailable ? 'Indisponible' : <>{formatCurrency(item.amountEUR, 'EUR')} <small>{formatCurrency(item.dividendPerShare, item.currency)} / action</small></>}</strong>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {dataIssues?.length > 0 && (
                <div className="data-issues-banner full-span">
                    <AlertCircle size={18} />
                    <div>
                        <strong>Historique à corriger</strong>
                        <p>{dataIssues.length} vente{dataIssues.length > 1 ? 's' : ''} dépasse{dataIssues.length > 1 ? 'nt' : ''} les titres détenus à la date indiquée. Le calcul des gains ne compte que les titres réellement détenus. Première anomalie : {dataIssues[0].message}</p>
                    </div>
                </div>
            )}
            {dataWarnings?.length > 0 && (
                <div className="data-warnings-banner full-span">
                    <AlertCircle size={18} />
                    <div>
                        <strong>Taux de change estimé</strong>
                        <p>{dataWarnings.length} opération{dataWarnings.length > 1 ? 's' : ''} ou position{dataWarnings.length > 1 ? 's' : ''} utilise{dataWarnings.length > 1 ? 'nt' : ''} un taux approximatif. Vérifiez les taux historiques des transactions étrangères. Première alerte : {dataWarnings[0]}</p>
                    </div>
                </div>
            )}
            {/* Répartition du portefeuille */}
            <div className="card dashboard-card full-span">
                <div className="card-header-flex">
                    <div>
                        <h3 className="card-title"><PieIcon size={16} /> Répartition du portefeuille</h3>
                        <p className="card-subtitle">Exposition calculée selon la valeur actuelle des positions</p>
                    </div>
                    <div className="allocation-switch" role="tablist" aria-label="Type de répartition">
                        {[
                            ['asset', 'Par titre'],
                            ['sector', 'Par secteur'],
                            ['country', 'Par pays'],
                        ].map(([mode, label]) => (
                            <button key={mode} type="button" role="tab" aria-selected={allocationMode === mode} className={allocationMode === mode ? 'active' : ''} onClick={() => setAllocationMode(mode)}>{label}</button>
                        ))}
                    </div>
                </div>

                {positions.length === 0 ? (
                    <div className="empty-state chart-empty">
                        <p>Aucune position active pour générer le graphique de répartition.</p>
                    </div>
                ) : (
                    <>
                        <div className="allocation-list">
                            {allocationData.map((item) => (
                                <div className="allocation-row" key={item.label} title={allocationMode === 'asset' ? item.label : item.companies.join(', ')}>
                                    <span className="allocation-dot" style={{ backgroundColor: item.color }} />
                                    <div className="allocation-label-wrap"><span className="allocation-label">{item.label}</span><small className="allocation-tickers">{allocationMode === 'asset' ? item.tickers.join(', ') : `${item.tickers.length} titre${item.tickers.length > 1 ? 's' : ''}`}</small></div>
                                    <div className="allocation-track"><span style={{ width: `${Math.max(item.weight, item.weight > 0 ? 1 : 0)}%`, backgroundColor: item.color }} /></div>
                                    <strong className="allocation-percent">{formatPercent(item.weight)}</strong>
                                    <span className="allocation-value">{formatCurrency(item.marketValue, 'EUR')}</span>
                                </div>
                            ))}
                        </div>
                        {allocationMode !== 'asset' && allocationData.some((item) => item.label === 'À classer') && (
                            <p className="allocation-note">Certains titres n’ont pas encore de secteur ou de pays associé.</p>
                        )}
                    </>
                )}
            </div>

            {/* Graphique de Performance par actif */}
            <div className="card dashboard-card full-span">
                <div className="card-header-flex">
                    <div>
                        <h3 className="card-title">
                            <BarChart3 size={16} /> Performance par actif (€)
                        </h3>
                        <p className="card-subtitle">Résultat latent de chaque position, converti en euros. Survole une barre pour le détail.</p>
                    </div>
                    <div className="performance-counts">
                        <span className="performance-gains">{gainCount} en hausse</span>
                        <span className="performance-losses">{lossCount} en baisse</span>
                    </div>
                </div>

                {positions.length === 0 ? (
                    <div className="empty-state chart-empty">
                        <p>Ajoutez des transactions pour comparer les performances de vos positions.</p>
                    </div>
                ) : (
                    <div style={{ width: '100%', height: Math.min(620, Math.max(300, pnlData.length * 34)), marginTop: '1rem' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pnlData} layout="vertical" margin={{ top: 4, right: 28, left: 0, bottom: 4 }} barCategoryGap="24%">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                                <XAxis type="number" domain={['auto', 'auto']} tickFormatter={(value) => formatCurrency(value, 'EUR')} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="ticker" width={190} interval={0} tick={<AssetAxisTick data={pnlData} />} axisLine={false} tickLine={false} />
                                <RechartsTooltip content={<CustomBarTooltip />} />
                                <ReferenceLine x={0} stroke="var(--border-strong)" strokeWidth={1.5} />
                                <Bar dataKey="unrealizedPnL" radius={[0, 5, 5, 0]} maxBarSize={20}>
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
                            <span className="stat-label">Capital investi</span>
                            <div className="stat-val">{formatCurrency(invested)}</div>
                            <span className="stat-desc">Total des investissements</span>
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
                        <div className="stat-icon-wrapper green">
                            <Coins size={20} />
                        </div>
                        <div>
                            <span className="stat-label">Dividendes nets perçus</span>
                            <div className={`stat-val ${(dividendsNet || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatCurrency(dividendsNet || 0)}
                            </div>
                            <span className="stat-desc">Après retenues et frais</span>
                        </div>
                    </div>

                    <div className="summary-stat-box">
                        <div className="stat-icon-wrapper amber">
                            <Award size={20} />
                        </div>
                        <div>
                            <span className="stat-label">Meilleure performance</span>
                            <div className="stat-val">
                                {topPerformer ? (topPerformer.name || topPerformer.ticker) : '—'}
                            </div>
                            <span className="stat-desc text-success">
                                {topPerformer ? `${topPerformer.ticker} · ${formatPercent(topPerformer.unrealizedPct, true)}` : 'Aucun titre'}
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
                                {worstPerformer ? (worstPerformer.name || worstPerformer.ticker) : '—'}
                            </div>
                            <span className="stat-desc text-danger">
                                {worstPerformer ? `${worstPerformer.ticker} · ${formatPercent(worstPerformer.unrealizedPct, true)}` : 'Aucun titre'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
