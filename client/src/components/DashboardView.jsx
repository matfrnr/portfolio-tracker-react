import { formatCurrency, formatPercent } from '../lib/portfolio'

const COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#4a3aa7', '#e34948', '#e87ba4']

export default function DashboardView({ snapshot }) {
    return (
        <div className="stack">
            <div className="card">
                <div className="card-title">Répartition du portefeuille</div>

                {snapshot.positions.length === 0 ? (
                    <div className="empty">Aucune position ouverte.</div>
                ) : (
                    <>
                        <div className="alloc-bar">
                            {snapshot.positions.map((position, index) => (
                                <div
                                    key={position.ticker}
                                    className="alloc-seg"
                                    style={{
                                        width: `${snapshot.invested > 0 ? (position.costBasis / snapshot.invested) * 100 : 0}%`,
                                        background: COLORS[index % COLORS.length],
                                    }}
                                />
                            ))}
                        </div>

                        <div className="alloc-legend">
                            {snapshot.positions.map((position, index) => {
                                const pct = snapshot.invested > 0 ? (position.costBasis / snapshot.invested) * 100 : 0
                                return (
                                    <span key={position.ticker}>
                                        <span
                                            className="alloc-dot"
                                            style={{ background: COLORS[index % COLORS.length] }}
                                        />
                                        {position.ticker} · {formatPercent(pct)} · {formatCurrency(position.costBasis)}
                                    </span>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>

            <div className="card">
                <div className="card-title">Résumé</div>
                <div className="summary-grid">
                    <div>
                        <span>PV réalisée</span>
                        <strong>{formatCurrency(snapshot.realizedPnL)}</strong>
                    </div>
                    <div>
                        <span>Frais cumulés</span>
                        <strong>{formatCurrency(snapshot.totalFees)}</strong>
                    </div>
                    <div>
                        <span>Valeur actuelle</span>
                        <strong>{formatCurrency(snapshot.currentValue)}</strong>
                    </div>
                    <div>
                        <span>Lignes ouvertes</span>
                        <strong>{snapshot.positions.length}</strong>
                    </div>
                </div>
            </div>
        </div>
    )
}