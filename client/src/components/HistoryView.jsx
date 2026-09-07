import { useMemo, useState } from 'react'
import {
    formatCurrency,
    formatQty,
    formatDateFR,
} from '../lib/portfolio'
import {
    Search,
    TrendingUp,
    TrendingDown,
    Trash2,
    Edit3,
    AlertTriangle,
    Calendar,
    Tag,
    Layers,
} from 'lucide-react'

export default function HistoryView({ transactions = [], onDelete, onEdit }) {
    const [historyTab, setHistoryTab] = useState('ALL') // 'ALL' | 'BUY' | 'SELL'
    const [searchQuery, setSearchQuery] = useState('')
    const [deleteCandidate, setDeleteCandidate] = useState(null)

    // Filtrage dynamique
    const filteredTransactions = useMemo(() => {
        return [...transactions]
            .filter((tx) => {
                if (historyTab !== 'ALL' && tx.type !== historyTab) return false
                if (!searchQuery.trim()) return true
                const q = searchQuery.trim().toLowerCase()
                return (
                    tx.ticker.toLowerCase().includes(q) ||
                    (tx.name && tx.name.toLowerCase().includes(q)) ||
                    (tx.note && tx.note.toLowerCase().includes(q))
                )
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }, [transactions, historyTab, searchQuery])

    // Totaux filtrés
    const stats = useMemo(() => {
        let totalBuy = 0
        let totalSell = 0
        let totalFees = 0

        for (const tx of transactions) {
            const qty = Number(tx.quantity || 0)
            const price = Number(tx.unitPrice || 0)
            const fees = Number(tx.fees || 0)
            totalFees += fees

            if (tx.type === 'BUY') {
                totalBuy += qty * price + fees
            } else {
                totalSell += qty * price - fees
            }
        }

        return { totalBuy, totalSell, totalFees }
    }, [transactions])

    function confirmDelete() {
        if (deleteCandidate) {
            onDelete(deleteCandidate.id)
            setDeleteCandidate(null)
        }
    }

    return (
        <div className="card history-card">
            <div className="history-header">
                <div>
                    <h2 className="card-title">Historique des opérations</h2>
                    <p className="card-subtitle">
                        Journal complet de tous vos ordres d'achat et de vente exécutés.
                    </p>
                </div>

                <div className="type-toggle">
                    <button
                        type="button"
                        className={historyTab === 'ALL' ? 'type-btn active' : 'type-btn'}
                        onClick={() => setHistoryTab('ALL')}
                    >
                        Toutes ({transactions.length})
                    </button>
                    <button
                        type="button"
                        className={historyTab === 'BUY' ? 'type-btn active buy' : 'type-btn'}
                        onClick={() => setHistoryTab('BUY')}
                    >
                        Achats ({transactions.filter((t) => t.type === 'BUY').length})
                    </button>
                    <button
                        type="button"
                        className={historyTab === 'SELL' ? 'type-btn active sell' : 'type-btn'}
                        onClick={() => setHistoryTab('SELL')}
                    >
                        Ventes ({transactions.filter((t) => t.type === 'SELL').length})
                    </button>
                </div>
            </div>

            {/* Statistiques rapides de l'historique */}
            <div className="history-mini-stats">
                <div className="mini-stat">
                    <span className="mini-stat-label">Total achats (avec frais)</span>
                    <strong className="mini-stat-val text-primary">
                        {formatCurrency(stats.totalBuy)}
                    </strong>
                </div>
                <div className="mini-stat">
                    <span className="mini-stat-label">Total ventes nettes</span>
                    <strong className="mini-stat-val text-accent">
                        {formatCurrency(stats.totalSell)}
                    </strong>
                </div>
                <div className="mini-stat">
                    <span className="mini-stat-label">Frais de courtage cumulés</span>
                    <strong className="mini-stat-val text-muted">
                        {formatCurrency(stats.totalFees)}
                    </strong>
                </div>
            </div>

            {/* Barre de recherche */}
            <div className="table-toolbar">
                <div className="search-bar">
                    <Search size={16} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Rechercher par ticker, entreprise, note..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <span className="results-count">
                    {filteredTransactions.length} opération{filteredTransactions.length > 1 ? 's' : ''} trouvée{filteredTransactions.length > 1 ? 's' : ''}
                </span>
            </div>

            {filteredTransactions.length === 0 ? (
                <div className="empty-state">
                    <p>Aucune transaction ne correspond aux critères sélectionnés.</p>
                </div>
            ) : (
                <div className="history-list">
                    {filteredTransactions.map((tx) => {
                        const isBuy = tx.type === 'BUY'
                        const gross = Number(tx.quantity || 0) * Number(tx.unitPrice || 0)
                        const fees = Number(tx.fees || 0)
                        const netTotal = isBuy ? gross + fees : gross - fees

                        return (
                            <div key={tx.id} className="history-item">
                                <div className="history-left">
                                    <div className={`history-type-icon ${isBuy ? 'buy' : 'sell'}`}>
                                        {isBuy ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                    </div>

                                    <div className="history-details">
                                        <div className="history-title-line">
                                            <span className="ticker-sym">{tx.ticker}</span>
                                            {tx.name && tx.name !== tx.ticker && (
                                                <span className="ticker-name-muted">({tx.name})</span>
                                            )}
                                            <span className={`badge ${isBuy ? 'badge-buy' : 'badge-sell'}`}>
                                                {isBuy ? 'Achat' : 'Vente'}
                                            </span>
                                        </div>

                                        <div className="history-meta-line">
                                            <span>
                                                <Calendar size={13} />
                                                {formatDateFR(tx.date)}
                                            </span>
                                            <span>·</span>
                                            <span>
                                                {formatQty(tx.quantity)} part(s) à {formatCurrency(tx.unitPrice)}
                                            </span>
                                            {fees > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span className="text-muted">
                                                        Frais : {formatCurrency(fees)}
                                                    </span>
                                                </>
                                            )}
                                            {tx.note && (
                                                <>
                                                    <span>·</span>
                                                    <span className="history-note">"{tx.note}"</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="history-right">
                                    <div className="history-amount-box">
                                        <div className={`history-total-amount ${isBuy ? 'text-primary' : 'text-success'}`}>
                                            {isBuy ? '-' : '+'}{formatCurrency(netTotal)}
                                        </div>
                                        <span className="history-amount-label">
                                            {isBuy ? 'Coût total net' : 'Produit net perçu'}
                                        </span>
                                    </div>

                                    <div className="history-actions">
                                        <button
                                            type="button"
                                            className="btn-icon edit"
                                            title="Modifier cette opération"
                                            onClick={() => onEdit(tx)}
                                        >
                                            <Edit3 size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-icon delete"
                                            title="Supprimer cette opération"
                                            onClick={() => setDeleteCandidate(tx)}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal de confirmation de suppression */}
            {deleteCandidate && (
                <div className="modal-overlay" onClick={() => setDeleteCandidate(null)}>
                    <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <AlertTriangle size={24} className="text-danger" />
                            <h3>Supprimer la transaction ?</h3>
                        </div>
                        <p className="modal-body">
                            Êtes-vous sûr de vouloir supprimer l'opération{' '}
                            <strong>
                                {deleteCandidate.type === 'BUY' ? "d'achat" : 'de vente'} de{' '}
                                {formatQty(deleteCandidate.quantity)} {deleteCandidate.ticker}
                            </strong>{' '}
                            du {formatDateFR(deleteCandidate.date)} ?
                        </p>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setDeleteCandidate(null)}
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                className="btn-danger"
                                onClick={confirmDelete}
                            >
                                Confirmer la suppression
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
