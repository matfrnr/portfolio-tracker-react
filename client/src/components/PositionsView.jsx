import { useState, useMemo, useEffect } from 'react'
import {
    formatCurrency,
    formatPercent,
    formatQty,
} from '../lib/portfolio'
import {
    Search,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    ArrowUpDown,
    PlusCircle,
    MinusCircle,
    SlidersHorizontal,
    Sparkles,
} from 'lucide-react'

export default function PositionsView({
    positions = [],
    onPriceChange,
    onRefreshLivePrices,
    isRefreshing,
    lastRefreshTime,
    onQuickAction,
    forexRate = 1.085,
}) {
    const [searchQuery, setSearchQuery] = useState('')
    const [sortField, setSortField] = useState('marketValue')
    const [sortAsc, setSortAsc] = useState(false)
    const [localPrices, setLocalPrices] = useState({})

    // Réinitialiser les prix locaux quand les positions changent depuis l'extérieur (ex: refresh)
    useEffect(() => {
        setLocalPrices({})
    }, [positions])

    // Filtrage et tri des positions
    const filteredPositions = useMemo(() => {
        let result = positions.filter((pos) => {
            const query = searchQuery.trim().toLowerCase()
            if (!query) return true
            return (
                pos.ticker.toLowerCase().includes(query) ||
                (pos.name && pos.name.toLowerCase().includes(query))
            )
        })

        result.sort((a, b) => {
            let valA = a[sortField]
            let valB = b[sortField]

            if (typeof valA === 'string') {
                valA = valA.toLowerCase()
                valB = (valB || '').toLowerCase()
                return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
            }

            valA = Number(valA || 0)
            valB = Number(valB || 0)
            return sortAsc ? valA - valB : valB - valA
        })

        return result
    }, [positions, searchQuery, sortField, sortAsc])

    function handleSort(field) {
        if (sortField === field) {
            setSortAsc(!sortAsc)
        } else {
            setSortField(field)
            setSortAsc(false)
        }
    }

    function handleLocalPriceChange(ticker, val) {
        setLocalPrices((prev) => ({ ...prev, [ticker]: val }))
    }

    function handlePriceBlur(ticker, initialPrice) {
        if (ticker in localPrices) {
            const raw = String(localPrices[ticker]).trim().replace(/\s+/g, '').replace(',', '.')
            const parsed = parseFloat(raw)
            if (!isNaN(parsed) && parsed >= 0 && parsed !== initialPrice) {
                onPriceChange(ticker, parsed)
            }
            // Nettoyer le prix local après application pour afficher la valeur server
            setLocalPrices((prev) => {
                const next = { ...prev }
                delete next[ticker]
                return next
            })
        }
    }

    function handlePriceKeyDown(e, ticker, initialPrice) {
        if (e.key === 'Enter') {
            handlePriceBlur(ticker, initialPrice)
            e.target.blur()
        }
    }

    return (
        <div className="card positions-card">
            <div className="positions-header">
                <div>
                    <h2 className="card-title">Positions ouvertes</h2>
                    <p className="card-subtitle">
                        Suivez en temps réel la valorisation, le PRU et les plus-values latentes de vos investissements.
                    </p>
                </div>

                <div className="header-actions">
                    {onRefreshLivePrices && (
                        <button
                            type="button"
                            className="btn-secondary refresh-btn"
                            onClick={onRefreshLivePrices}
                            disabled={isRefreshing}
                            title="Actualiser les cours en direct"
                        >
                            <RefreshCw size={14} className={isRefreshing ? 'spin-icon' : ''} />
                            {isRefreshing ? 'Actualisation...' : 'Actualiser les cours'}
                        </button>
                    )}
                </div>
            </div>

            {/* Barre d'outils et recherche */}
            <div className="table-toolbar">
                <div className="search-bar">
                    <Search size={16} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Rechercher par ticker ou nom..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {lastRefreshTime && (
                    <div className="last-sync-badge">
                        <Sparkles size={12} />
                        Cours : {lastRefreshTime}
                    </div>
                )}
                {forexRate && (
                    <div className="last-sync-badge" title="Taux de change réel EUR/USD">
                        💱 1 € = {Number(forexRate).toFixed(4)} $
                    </div>
                )}
            </div>

            {filteredPositions.length === 0 ? (
                <div className="empty-state">
                    {positions.length === 0 ? (
                        <>
                            <div className="empty-state-icon">💼</div>
                            <h3>Aucune position ouverte</h3>
                            <p>Ajoutez votre première transaction pour voir apparaître vos lignes de portefeuille.</p>
                            <button
                                type="button"
                                className="btn-primary"
                                style={{ marginTop: '1rem' }}
                                onClick={() => onQuickAction && onQuickAction('BUY', {})}
                            >
                                <PlusCircle size={16} />
                                Ajouter un achat
                            </button>
                        </>
                    ) : (
                        <p>Aucune position ne correspond à votre recherche "{searchQuery}".</p>
                    )}
                </div>
            ) : (
                <div className="table-wrap">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('ticker')} className="sortable-th">
                                    <div className="th-content">
                                        Actif <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('quantity')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Qté <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('averageCost')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        PRU d'achat <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('costBasis')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Investi (€) <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('currentPrice')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Cours actuel <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('marketValue')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Valeur (€) <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('unrealizedPnL')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Gain / Perte (€) <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('allocationWeight')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Poids <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th className="text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPositions.map((pos) => {
                                const isPos = pos.unrealizedPnL >= 0
                                const currentDisplayPrice =
                                    pos.ticker in localPrices
                                        ? localPrices[pos.ticker]
                                        : pos.currentPrice > 0
                                          ? pos.currentPrice
                                          : ''

                                return (
                                    <tr key={pos.ticker} className="table-row">
                                        <td>
                                            <div className="ticker-badge-box">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <span className="ticker-sym">{pos.ticker}</span>
                                                    {pos.currency === 'USD' && (
                                                        <span className="badge badge-buy" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                                                            USD
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="ticker-name" title={pos.name}>
                                                    {pos.name || pos.ticker}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="text-right font-mono font-medium">
                                            {formatQty(pos.quantity)}
                                        </td>
                                        <td className="text-right font-mono">
                                            {formatCurrency(pos.averageCost, pos.currency)}
                                        </td>
                                        <td className="text-right font-mono text-secondary">
                                            {formatCurrency(pos.costBasis, 'EUR')}
                                        </td>
                                        <td className="text-right">
                                            <div className="price-input-wrapper">
                                                <input
                                                    className="price-input"
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={currentDisplayPrice}
                                                    onChange={(e) =>
                                                        handleLocalPriceChange(pos.ticker, e.target.value)
                                                    }
                                                    onBlur={() => handlePriceBlur(pos.ticker, pos.currentPrice)}
                                                    onKeyDown={(e) =>
                                                        handlePriceKeyDown(e, pos.ticker, pos.currentPrice)
                                                    }
                                                    placeholder="0.00"
                                                    title={`Modifiez le cours en ${pos.currency === 'USD' ? 'Dollars ($)' : 'Euros (€)'}`}
                                                />
                                            </div>
                                        </td>
                                        <td className="text-right font-mono font-bold">
                                            {formatCurrency(pos.marketValue, 'EUR')}
                                        </td>
                                        <td className="text-right">
                                            <div className={`pnl-badge ${isPos ? 'pos' : 'neg'}`}>
                                                {formatCurrency(pos.unrealizedPnL, 'EUR')}
                                            </div>
                                            <div className={`pnl-sub ${isPos ? 'pos' : 'neg'}`}>
                                                {formatPercent(pos.unrealizedPct, true)}
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <div className="weight-cell">
                                                <span className="weight-val">
                                                    {formatPercent(pos.allocationWeight)}
                                                </span>
                                                <div className="weight-bar-bg">
                                                    <div
                                                        className="weight-bar-fill"
                                                        style={{ width: `${Math.min(100, pos.allocationWeight)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <div className="action-btn-group">
                                                <button
                                                    type="button"
                                                    className="icon-action-btn buy"
                                                    title={`Acheter plus de ${pos.ticker}`}
                                                    onClick={() =>
                                                        onQuickAction &&
                                                        onQuickAction('BUY', {
                                                            ticker: pos.ticker,
                                                            name: pos.name,
                                                            currentPrice: pos.currentPrice,
                                                        })
                                                    }
                                                >
                                                    <PlusCircle size={15} />
                                                    <span>Achat</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="icon-action-btn sell"
                                                    title={`Vendre des parts de ${pos.ticker}`}
                                                    onClick={() =>
                                                        onQuickAction &&
                                                        onQuickAction('SELL', {
                                                            ticker: pos.ticker,
                                                            name: pos.name,
                                                            currentPrice: pos.currentPrice,
                                                        })
                                                    }
                                                >
                                                    <MinusCircle size={15} />
                                                    <span>Vente</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}