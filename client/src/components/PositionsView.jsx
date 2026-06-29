import { formatCurrency, formatPercent, formatQty } from '../lib/portfolio'

export default function PositionsView({ positions, onPriceChange }) {
    return (
        <div className="card">
            <div className="card-title">
                Positions ouvertes — saisir le cours actuel pour calculer le gain/perte
            </div>

            {positions.length === 0 ? (
                <div className="empty">Aucune position ouverte.</div>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Valeur</th>
                                <th>Qté</th>
                                <th>PRU</th>
                                <th>Investi</th>
                                <th>Cours actuel</th>
                                <th>Gain / Perte</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((position) => (
                                <tr key={position.ticker}>
                                    <td>
                                        <div className="ticker-sym">{position.ticker}</div>
                                        <div className="ticker-name">{position.name}</div>
                                    </td>
                                    <td>{formatQty(position.quantity)}</td>
                                    <td>{formatCurrency(position.averageCost)}</td>
                                    <td>{formatCurrency(position.costBasis)}</td>
                                    <td>
                                        <input
                                            className="price-input"
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={position.currentPrice || ''}
                                            onChange={(event) => onPriceChange(position.ticker, event.target.value)}
                                            placeholder="0.00"
                                        />
                                    </td>
                                    <td>
                                        <div className={position.unrealizedPnL >= 0 ? 'gain-pos' : 'gain-neg'}>
                                            {formatCurrency(position.unrealizedPnL)}
                                        </div>
                                        <div className="gain-sub">{formatPercent(position.unrealizedPct)}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}