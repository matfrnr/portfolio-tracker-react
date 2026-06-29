import { formatCurrency, formatPercent } from '../lib/portfolio'

export default function KpiRow({ snapshot }) {
    const pnlPct = snapshot.invested > 0 ? (snapshot.unrealizedPnL / snapshot.invested) * 100 : 0

    return (
        <div className="kpi-row">
            <div className="kpi">
                <div className="kpi-label">Valeur totale</div>
                <div className="kpi-value">{formatCurrency(snapshot.currentValue)}</div>
                <div className={`kpi-delta ${snapshot.totalPnL >= 0 ? 'pos' : 'neg'}`}>{formatCurrency(snapshot.totalPnL)}</div>
            </div>
            <div className="kpi">
                <div className="kpi-label">Investi</div>
                <div className="kpi-value">{formatCurrency(snapshot.invested)}</div>
            </div>
            <div className="kpi">
                <div className="kpi-label">Gain / Perte</div>
                <div className={`kpi-value ${snapshot.unrealizedPnL >= 0 ? 'pos' : 'neg'}`}>{formatCurrency(snapshot.unrealizedPnL)}</div>
                <div className={`kpi-delta ${snapshot.unrealizedPnL >= 0 ? 'pos' : 'neg'}`}>{formatPercent(pnlPct)}</div>
            </div>
            <div className="kpi">
                <div className="kpi-label">Positions</div>
                <div className="kpi-value">{snapshot.positions.length}</div>
                <div className="kpi-delta">{snapshot.transactionCount} transaction{snapshot.transactionCount > 1 ? 's' : ''}</div>
            </div>
        </div>
    )
}