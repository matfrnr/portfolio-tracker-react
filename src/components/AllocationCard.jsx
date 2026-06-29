import { formatCurrency, formatPercent } from '../lib/portfolio'

const colors = ['#4f98a3', '#5591c7', '#e8af34', '#a86fdf', '#dd6974', '#fdab43']

export default function AllocationCard({ positions, invested }) {
    return (
        <section className="panel">
            <div className="panel-heading">
                <div>
                    <p className="eyebrow">Allocation</p>
                    <h2>Répartition du portefeuille</h2>
                </div>
            </div>

            {positions.length === 0 ? (
                <div className="empty-state">L’allocation apparaîtra après tes premiers achats.</div>
            ) : (
                <>
                    <div className="allocation-bar">
                        {positions.map((position, index) => (
                            <span
                                key={position.ticker}
                                style={{ width: `${(position.costBasis / invested) * 100}%`, background: colors[index % colors.length] }}
                            />
                        ))}
                    </div>
                    <div className="allocation-list">
                        {positions.map((position, index) => {
                            const pct = invested > 0 ? (position.costBasis / invested) * 100 : 0
                            return (
                                <div key={position.ticker} className="allocation-item">
                                    <span className="allocation-dot" style={{ background: colors[index % colors.length] }} />
                                    <span>{position.ticker}</span>
                                    <span className="muted-cell">{formatCurrency(position.costBasis)} • {formatPercent(pct)}</span>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}
        </section>
    )
}