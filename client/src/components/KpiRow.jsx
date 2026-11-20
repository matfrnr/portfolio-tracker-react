import { formatCurrency, formatPercent } from '../lib/portfolio'
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function KpiRow({ snapshot, portfolioScope = 'all' }) {
    const {
        currentValue,
        cashValue = 0,
        untrackedSavingsValue = 0,
        hasManualSavingsPerformance = false,
        hasTrackedPerformancePositions = false,
        invested,
        totalPnL,
        totalPnLPct,
        positions,
        transactionCount,
        unrealizedPnL,
        unrealizedPct,
    } = snapshot

    const performanceUnknown = (
        portfolioScope === 'savings' && !hasManualSavingsPerformance
    ) || (
        portfolioScope === 'all' && positions.length > 0 && !hasTrackedPerformancePositions
    )
    const hasUntrackedAssets = portfolioScope === 'all' && (cashValue > 0 || untrackedSavingsValue > 0)
    const isTotalPos = totalPnL > 0
    const isTotalNeg = totalPnL < 0
    const isUnrealizedPos = unrealizedPnL > 0
    const isUnrealizedNeg = unrealizedPnL < 0
    const totalTone = performanceUnknown || (!isTotalPos && !isTotalNeg) ? 'neutral' : isTotalPos ? 'green' : 'red'
    const unrealizedTone = performanceUnknown || (!isUnrealizedPos && !isUnrealizedNeg) ? 'neutral' : isUnrealizedPos ? 'green' : 'red'

    return (
        <div className="kpi-grid">
            <div className="kpi-card">
                <div className="kpi-top">
                    <span className="kpi-title">{hasUntrackedAssets ? 'Patrimoine total' : 'Valeur totale du portefeuille'}</span>
                    <div className="kpi-icon-badge blue"><Wallet size={18} /></div>
                </div>
                <div className="kpi-main-val">{formatCurrency(currentValue, 'EUR')}</div>
                <div className={`kpi-bottom ${hasUntrackedAssets ? 'kpi-bottom-stacked' : ''}`}>
                    <span className={`delta-badge ${isTotalPos ? 'pos' : isTotalNeg ? 'neg' : 'neutral'}`}>
                        {isTotalPos ? <ArrowUpRight size={14} /> : isTotalNeg ? <ArrowDownRight size={14} /> : null}
                        {performanceUnknown ? '—' : formatPercent(totalPnLPct, true)}
                    </span>
                    <span className={`kpi-subtext ${hasUntrackedAssets ? 'kpi-subtext-multiline' : ''}`}>
                        {hasUntrackedAssets
                            ? performanceUnknown
                                ? <>Épargne incluse dans le patrimoine.<br />Performance non renseignée.</>
                                : <>Total du patrimoine.<br />Le % porte sur les actifs avec performance renseignée.</>
                            : 'Convertie en EUR'}
                    </span>
                </div>
            </div>

            <div className="kpi-card">
                <div className="kpi-top">
                    <span className="kpi-title">Capital investi</span>
                    <div className="kpi-icon-badge purple"><PiggyBank size={18} /></div>
                </div>
                <div className="kpi-main-val">{performanceUnknown ? '—' : formatCurrency(invested, 'EUR')}</div>
                <div className="kpi-bottom">
                    <span className="kpi-subtext">{performanceUnknown ? 'Capital de référence non renseigné' : <>Sur <strong>{positions.length}</strong> position{positions.length > 1 ? 's' : ''}</>}</span>
                </div>
            </div>

            <div className="kpi-card">
                <div className="kpi-top">
                    <span className="kpi-title">Plus-value latente</span>
                    <div className={`kpi-icon-badge ${unrealizedTone}`}>
                        {isUnrealizedPos ? <TrendingUp size={18} /> : isUnrealizedNeg ? <TrendingDown size={18} /> : <Layers size={18} />}
                    </div>
                </div>
                <div className={`kpi-main-val ${performanceUnknown ? 'text-secondary' : isUnrealizedPos ? 'text-success' : isUnrealizedNeg ? 'text-danger' : 'text-secondary'}`}>
                    {performanceUnknown ? '—' : formatCurrency(unrealizedPnL, 'EUR')}
                </div>
                <div className="kpi-bottom">
                    {!performanceUnknown && <span className={`delta-badge ${unrealizedTone === 'neutral' ? 'neutral' : unrealizedTone === 'green' ? 'pos' : 'neg'}`}>{formatPercent(unrealizedPct, true)}</span>}
                    <span className="kpi-subtext">{performanceUnknown ? 'Plus-value / moins-value non renseignée' : hasUntrackedAssets ? 'Épargne non suivie exclue' : 'Convertie en EUR'}</span>
                </div>
            </div>

            <div className="kpi-card">
                <div className="kpi-top">
                    <span className="kpi-title">Performance cumulée nette</span>
                    <div className={`kpi-icon-badge ${totalTone}`}><Layers size={18} /></div>
                </div>
                <div className={`kpi-main-val ${performanceUnknown ? 'text-secondary' : isTotalPos ? 'text-success' : isTotalNeg ? 'text-danger' : 'text-secondary'}`}>
                    {performanceUnknown ? '—' : formatCurrency(totalPnL, 'EUR')}
                </div>
                <div className="kpi-bottom">
                    <span className="kpi-subtext">
                        {performanceUnknown
                            ? 'Renseigne la plus-value ou moins-value si tu la connais'
                            : portfolioScope === 'savings'
                                ? 'Performance renseignée manuellement'
                                : hasUntrackedAssets
                                    ? 'Épargne sans performance renseignée exclue'
                                    : <><strong>{transactionCount}</strong> opération{transactionCount > 1 ? 's' : ''} enregistrée{transactionCount > 1 ? 's' : ''}</>}
                    </span>
                </div>
            </div>
        </div>
    )
}
