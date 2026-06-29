import { formatCurrency, formatQty } from '../lib/portfolio'

export default function HistoryView({ transactions, onDelete }) {
    return (
        <div className="card">
            <div className="card-title">Historique des transactions</div>

            {transactions.length === 0 ? (
                <div className="empty">Aucune transaction enregistrée.</div>
            ) : (
                <div>
                    {transactions.map((tx) => (
                        <div key={tx.id} className="history-row">
                            <div>
                                <div>
                                    <span className={tx.type === 'BUY' ? 'badge badge-buy' : 'badge badge-sell'}>
                                        {tx.type === 'BUY' ? 'Achat' : 'Vente'}
                                    </span>{' '}
                                    <span style={{ fontWeight: 500 }}>{tx.ticker}</span>{' '}
                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                        {formatQty(tx.quantity)} × {formatCurrency(tx.unitPrice)}
                                    </span>
                                </div>

                                <div className="history-meta">
                                    {new Date(tx.date).toLocaleDateString('fr-FR')} {tx.note ? `· ${tx.note}` : ''}
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontWeight: 500 }}>
                                    {formatCurrency(tx.quantity * tx.unitPrice + (tx.type === 'BUY' ? tx.fees : -tx.fees))}
                                </span>
                                <button className="del-btn" type="button" onClick={() => onDelete(tx.id)}>
                                    ×
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}