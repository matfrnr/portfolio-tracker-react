import { formatCurrency, formatPercent, formatQty } from '../lib/portfolio'

export default function PositionsTable({ positions, onPriceChange }) {
    return (
        <section className="panel">
            <div className="panel-heading">
                <div>
                    <p className="eyebrow">Positions</p>
                    <h2>Positions ouvertes</h2>
                </div>
            </div>

            {positions.length === 0 ? (
                <div className="empty-state">Aucune position ouverte pour le moment.</div>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Valeur</th>
                                <th>Qté</th>
                                <th>PRU</th>
                                <th>Investi</th>
                                <th>Cours</th>
                                <th>Valeur</th>
                                <th>PV latente</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((position) => (
                                <tr key={position.ticker}>
                                    <td>
                                        <div className="symbol">{position.ticker}</div>
                                        <div className="muted-cell">{position.name}</div>
                                    </td>
                                    <td>{formatQty(position.quantity)}</td>
                                    <td>{formatCurrency(position.averageCost)}</td>
                                    <td>{formatCurrency(position.costBasis)}</td>
                                    <td>
                                        <input
                                            className="table-input"
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={position.currentPrice || ''}
                                            onChange={(e) => onPriceChange(position.ticker, e.target.value)}
                                            placeholder="0,00"
                                        />
                                    </td>
                                    <td>{formatCurrency(position.marketValue)}</td>
                                    <td>
                                        <span className={position.unrealizedPnL >= 0 ? 'positive' : 'negative'}>
                                            {formatCurrency(position.unrealizedPnL)}
                                        </span>
                                        <div className="muted-cell">{formatPercent(position.unrealizedPct)}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}