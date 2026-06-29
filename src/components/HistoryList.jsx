import { Trash2 } from 'lucide-react'
import { formatCurrency, formatQty } from '../lib/portfolio'

export default function HistoryList({ transactions, onDelete }) {
    return (
        <section className="panel">
            <div className="panel-heading">
                <div>
                    <p className="eyebrow">Historique</p>
                    <h2>Toutes les transactions</h2>
                </div>
            </div>

            {transactions.length === 0 ? (
                <div className="empty-state">Ajoute une première transaction pour démarrer.</div>
            ) : (
                <div className="history-list">
                    {transactions.map((tx) => (
                        <article key={tx.id} className="history-item">
                            <div>
                                <div className="history-top">
                                    <span className={tx.type === 'BUY' ? 'pill buy' : 'pill sell'}>{tx.type === 'BUY' ? 'Achat' : 'Vente'}</span>
                                    <strong>{tx.ticker}</strong>
                                    <span className="muted-cell">{formatQty(tx.quantity)} × {formatCurrency(tx.unitPrice)}</span>
                                </div>
                                <p className="muted-cell">
                                    {new Date(tx.date).toLocaleDateString('fr-FR')} • {tx.note || 'Sans note'}
                                </p>
                            </div>
                            <div className="history-actions">
                                <strong>{formatCurrency(tx.quantity * tx.unitPrice)}</strong>
                                <button type="button" className="icon-button" onClick={() => onDelete(tx.id)} aria-label={`Supprimer la transaction ${tx.ticker}`}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    )
}