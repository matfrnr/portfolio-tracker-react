import { useMemo, useState } from 'react'
import {
    formatCurrency,
    formatQty,
    formatDateFR,
    transactionRate,
    defaultCurrencyForTicker,
    formatAssetName,
    realizedPnLByTransaction,
} from '../lib/portfolio'
import {
    Search,
    TrendingUp,
    TrendingDown,
    Coins,
    Trash2,
    Edit3,
    AlertTriangle,
    Calendar,
} from 'lucide-react'

const HISTORY_RECENT_START = '2026-11-01'

export default function HistoryView({ transactions = [], onDelete, onEdit, forexRate = 1.085, forexRates = { USD: forexRate }, currencies = {} }) {
    const [historyTab, setHistoryTab] = useState('ALL')
    const [searchQuery, setSearchQuery] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [showOlder, setShowOlder] = useState(false)
    const [sellResultFilter, setSellResultFilter] = useState('ALL')
    const [deleteCandidate, setDeleteCandidate] = useState(null)
    const realizedGains = useMemo(() => realizedPnLByTransaction(transactions, forexRates || forexRate), [transactions, forexRates, forexRate])

    // Filtrage dynamique
    const matchingTransactions = useMemo(() => {
        return [...transactions]
            .filter((tx) => {
                if (historyTab !== 'ALL' && tx.type !== historyTab) return false
                if (historyTab === 'SELL' && tx.type === 'SELL' && sellResultFilter !== 'ALL') {
                    const realizedPnL = realizedGains.get(tx.id)
                    if (sellResultFilter === 'GAIN' && !(realizedPnL > 0)) return false
                    if (sellResultFilter === 'LOSS' && !(realizedPnL < 0)) return false
                }
                const txDate = String(tx.date || '').slice(0, 10)
                if (dateFrom && txDate < dateFrom) return false
                if (dateTo && txDate > dateTo) return false
                if (!searchQuery.trim()) return true
                const q = searchQuery.trim().toLowerCase()
                return (
                    String(tx.ticker || '').toLowerCase().includes(q) ||
                    String(tx.name || '').toLowerCase().includes(q) ||
                    String(tx.note || '').toLowerCase().includes(q)
                )
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }, [transactions, historyTab, searchQuery, dateFrom, dateTo, sellResultFilter, realizedGains])

    const hasCustomDateRange = Boolean(dateFrom || dateTo)
    const olderTransactions = useMemo(() => hasCustomDateRange
        ? []
        : matchingTransactions.filter((tx) => String(tx.date || '').slice(0, 10) < HISTORY_RECENT_START),
    [matchingTransactions, hasCustomDateRange])
    const recentTransactions = useMemo(() => hasCustomDateRange || showOlder
        ? matchingTransactions
        : matchingTransactions.filter((tx) => String(tx.date || '').slice(0, 10) >= HISTORY_RECENT_START),
    [matchingTransactions, hasCustomDateRange, showOlder])

    // Totaux filtrés consolidés en EUR
    const stats = useMemo(() => {
        let totalBuy = 0
        let totalSell = 0
        let totalFees = 0
        let dividendsNet = 0
        let realizedSalesPnL = 0

        for (const tx of recentTransactions) {
            const qty = Number(tx.quantity || 0)
            const price = Number(tx.unitPrice || 0)
            const fees = Number(tx.fees || 0)
            const currency = tx.currency || currencies[tx.ticker] || defaultCurrencyForTicker(tx.ticker)
            const rate = transactionRate({ ...tx, currency }, forexRates || forexRate)

            const feesEUR = fees / rate
            totalFees += feesEUR

            if (tx.type === 'BUY') {
                totalBuy += (qty * price + fees) / rate
            } else if (tx.type === 'SELL') {
                totalSell += (qty * price - fees) / rate
                realizedSalesPnL += realizedGains.get(tx.id) || 0
            } else if (tx.type === 'DIVIDEND') {
                dividendsNet += (price - fees) / rate
            }
        }

        return { totalBuy, totalSell, totalFees, dividendsNet, realizedSalesPnL }
    }, [recentTransactions, forexRates, forexRate, currencies, realizedGains])

    const visibleStats = historyTab === 'BUY'
        ? [
            { label: 'Total achats (frais inclus)', value: stats.totalBuy, tone: 'text-primary' },
            { label: 'Frais d’achat', value: stats.totalFees, tone: 'text-muted' },
        ]
        : historyTab === 'SELL'
            ? [
                { label: 'Total ventes nettes', value: stats.totalSell, tone: 'text-accent' },
                { label: 'Plus-value / moins-value réalisée', value: stats.realizedSalesPnL, tone: stats.realizedSalesPnL > 0 ? 'text-success' : stats.realizedSalesPnL < 0 ? 'text-danger' : 'text-secondary' },
                { label: 'Frais de vente', value: stats.totalFees, tone: 'text-muted' },
            ]
            : historyTab === 'DIVIDEND'
                ? [
                    { label: 'Dividendes nets perçus', value: stats.dividendsNet, tone: 'text-success' },
                    { label: 'Retenues et frais', value: stats.totalFees, tone: 'text-muted' },
                ]
                : [
                    { label: 'Total achats (frais inclus)', value: stats.totalBuy, tone: 'text-primary' },
                    { label: 'Total ventes nettes', value: stats.totalSell, tone: 'text-accent' },
                    { label: 'Frais et retenues cumulés', value: stats.totalFees, tone: 'text-muted' },
                    { label: 'Dividendes nets perçus', value: stats.dividendsNet, tone: 'text-success' },
                ]

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
                        Achats, ventes et dividendes, avec montants nets et devises de règlement.
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
                        className={historyTab === 'DIVIDEND' ? 'type-btn active dividend' : 'type-btn'}
                        onClick={() => setHistoryTab('DIVIDEND')}
                    >
                        Dividendes ({transactions.filter((t) => t.type === 'DIVIDEND').length})
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
                <p className="history-stats-caption">Totaux des opérations affichées</p>
                {visibleStats.map((item) => (
                    <div className="mini-stat" key={item.label}>
                        <span className="mini-stat-label">{item.label}</span>
                        <strong className={`mini-stat-val ${item.tone}`}>{formatCurrency(item.value, 'EUR')}</strong>
                    </div>
                ))}
            </div>

            <div className="history-filter-controls">
                <label>
                    <span>Du</span>
                    <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setShowOlder(false) }} aria-label="Date de début de l’historique" />
                </label>
                <label>
                    <span>Au</span>
                    <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setShowOlder(false) }} aria-label="Date de fin de l’historique" />
                </label>
                {hasCustomDateRange ? <button type="button" className="history-reset-filter" onClick={() => { setDateFrom(''); setDateTo(''); setShowOlder(false) }}>Effacer les dates</button> : <span className="history-default-range">Affichage par défaut depuis le 1er novembre 2026</span>}
            </div>

            {historyTab === 'SELL' && (
                <div className="history-result-filter" role="group" aria-label="Filtrer les ventes par résultat réalisé">
                    <span>Résultat de la vente</span>
                    <div className="history-result-filter-buttons">
                        <button type="button" className={sellResultFilter === 'ALL' ? 'active' : ''} aria-pressed={sellResultFilter === 'ALL'} onClick={() => setSellResultFilter('ALL')}>Toutes</button>
                        <button type="button" className={sellResultFilter === 'GAIN' ? 'active positive' : ''} aria-pressed={sellResultFilter === 'GAIN'} onClick={() => setSellResultFilter('GAIN')}>Plus-values</button>
                        <button type="button" className={sellResultFilter === 'LOSS' ? 'active negative' : ''} aria-pressed={sellResultFilter === 'LOSS'} onClick={() => setSellResultFilter('LOSS')}>Moins-values</button>
                    </div>
                </div>
            )}

            {/* Recherche et opérations anciennes */}
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
                {!hasCustomDateRange && olderTransactions.length > 0 && (
                    <button type="button" className="history-expand-button" onClick={() => setShowOlder((current) => !current)}>
                        {showOlder ? 'Masquer les opérations avant novembre' : `Voir les ${olderTransactions.length} opérations antérieures à novembre`}
                    </button>
                )}
                <span className="results-count">
                    {recentTransactions.length} affichée{recentTransactions.length > 1 ? 's' : ''} sur {matchingTransactions.length} résultat{matchingTransactions.length > 1 ? 's' : ''}
                </span>
            </div>

            {recentTransactions.length === 0 ? (
                <div className="empty-state">
                    <p>{olderTransactions.length > 0 ? 'Aucune opération depuis le 1er novembre. Les opérations plus anciennes sont masquées.' : 'Aucune transaction ne correspond aux critères sélectionnés.'}</p>
                </div>
            ) : (
                <div className="history-list">
                    {recentTransactions.map((tx) => {
                        const isBuy = tx.type === 'BUY'
                        const isSell = tx.type === 'SELL'
                        const isDividend = tx.type === 'DIVIDEND'
                        const quantity = Number(tx.quantity || 0)
                        const unitPrice = Number(tx.unitPrice || 0)
                        const fees = Number(tx.fees || 0)
                        const gross = isDividend ? unitPrice : quantity * unitPrice
                        const netTotal = isBuy ? gross + fees : gross - fees
                        const currency = tx.currency || currencies[tx.ticker] || defaultCurrencyForTicker(tx.ticker)
                        const rate = transactionRate({ ...tx, currency }, forexRates || forexRate)
                        const netTotalEUR = netTotal / rate

                        return (
                            <div key={tx.id} className="history-item">
                                <div className="history-left">
                                    <div className={`history-type-icon ${isBuy ? 'buy' : isSell ? 'sell' : 'dividend'}`}>
                                        {isBuy ? <TrendingUp size={18} /> : isSell ? <TrendingDown size={18} /> : <Coins size={18} />}
                                    </div>

                                    <div className="history-details">
                                        <div className="history-title-line">
                                            <span className="history-asset-name">{formatAssetName(tx.name, tx.ticker)}<small>{tx.ticker}</small></span>
                                            <span className={`badge ${isBuy ? 'badge-buy' : isSell ? 'badge-sell' : 'badge-dividend'}`}>
                                                {isBuy ? 'Achat' : isSell ? 'Vente' : 'Dividende'}
                                            </span>
                                            {currency !== 'EUR' && (
                                                <span className="badge badge-buy" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                                                    {currency}
                                                </span>
                                            )}
                                        </div>

                                        <div className="history-meta-line">
                                            <span>
                                                <Calendar size={13} />
                                                {formatDateFR(tx.date)}
                                            </span>
                                            <span>·</span>
                                            <span>
                                                {isDividend ? `Montant brut : ${formatCurrency(tx.unitPrice, currency)}` : `${formatQty(tx.quantity)} part(s) à ${formatCurrency(tx.unitPrice, currency)}`}
                                            </span>
                                            {fees > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span className="text-muted">
                                                {isDividend ? 'Retenue / frais' : 'Frais'} : {formatCurrency(fees, currency)}
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
                                            {isBuy ? '-' : '+'}{formatCurrency(netTotal, currency)}
                                        </div>
                                        <span className="history-amount-label">
                                            {isBuy ? 'Coût total avec frais' : isSell ? 'Produit net perçu' : 'Dividende net perçu'}
                                            {currency !== 'EUR' && (
                                                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    (≈ {formatCurrency(netTotalEUR, 'EUR')})
                                                </span>
                                            )}
                                        </span>
                                        {isSell && realizedGains.has(tx.id) && (
                                            <span className={`history-realized-pnl ${realizedGains.get(tx.id) >= 0 ? 'positive' : 'negative'}`}>
                                                {realizedGains.get(tx.id) >= 0 ? 'PV réalisée' : 'MV réalisée'} · {formatCurrency(Math.abs(realizedGains.get(tx.id)), 'EUR')}
                                            </span>
                                        )}
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
                                {deleteCandidate.type === 'BUY'
                                    ? `d'achat de ${formatQty(deleteCandidate.quantity)} ${deleteCandidate.ticker}`
                                    : deleteCandidate.type === 'SELL'
                                        ? `de vente de ${formatQty(deleteCandidate.quantity)} ${deleteCandidate.ticker}`
                                        : `de dividende ${deleteCandidate.ticker}`}
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
