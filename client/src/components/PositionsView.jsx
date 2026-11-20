import { useState, useMemo, useEffect } from 'react'
import {
    formatCurrency,
    formatPercent,
    formatQty,
    formatAssetName,
    isCryptoTicker,
    MANUAL_SAVINGS_TICKER,
    MANUAL_CASH_ASSETS,
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
    assetMetadata = {},
    onAssetMetadataChange,
    tagCatalog = [],
    onTagCatalogChange,
    portfolioScope = 'stocks',
    cashData = {},
}) {
    const [searchQuery, setSearchQuery] = useState('')
    const [sortField, setSortField] = useState('marketValue')
    const [sortAsc, setSortAsc] = useState(false)
    const [localPrices, setLocalPrices] = useState({})
    const [tagDraft, setTagDraft] = useState('')
    const [tagFilter, setTagFilter] = useState('')
    const [editingPru, setEditingPru] = useState(null)

    // Réinitialiser les prix locaux quand les positions changent depuis l'extérieur (ex: refresh)
    useEffect(() => {
        setLocalPrices({})
    }, [positions])

    // Filtrage et tri des positions
    const filteredPositions = useMemo(() => {
        let result = positions.filter((pos) => {
            const query = searchQuery.trim().toLowerCase()
            const rawTags = assetMetadata[pos.ticker]?.tags || []
            const tags = Array.isArray(rawTags) ? rawTags : String(rawTags).split(',').map((tag) => tag.trim())
            if (tagFilter && !tags.includes(tagFilter)) return false
            if (!query) return true
            return (
                pos.ticker.toLowerCase().includes(query) ||
                (pos.name && pos.name.toLowerCase().includes(query))
            )
        })

        result.sort((a, b) => {
            let valA = sortField === 'tags' ? (Array.isArray(assetMetadata[a.ticker]?.tags) ? assetMetadata[a.ticker].tags.join(',') : String(assetMetadata[a.ticker]?.tags || '')) : sortField === 'unrealizedPnL' ? a.unrealizedPnLNative : a[sortField]
            let valB = sortField === 'tags' ? (Array.isArray(assetMetadata[b.ticker]?.tags) ? assetMetadata[b.ticker].tags.join(',') : String(assetMetadata[b.ticker]?.tags || '')) : sortField === 'unrealizedPnL' ? b.unrealizedPnLNative : b[sortField]

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
    }, [positions, searchQuery, sortField, sortAsc, assetMetadata, tagFilter])

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
            if (!isNaN(parsed) && parsed > 0 && parsed !== initialPrice) {
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

    if (portfolioScope === 'savings') {
        const savingsPosition = positions.find((position) => position.isManualSavings || position.ticker === MANUAL_SAVINGS_TICKER)
        const hasManualPerformance = Boolean(savingsPosition?.hasManualPerformance)
        return (
            <div className="card positions-card">
                <div className="positions-header">
                    <div>
                        <h2 className="card-title">Épargne salariale</h2>
                        <p className="card-subtitle">Valeur globale de tes fonds et performance facultative saisies depuis ton relevé.</p>
                    </div>
                </div>
                {savingsPosition ? (
                    <div className="savings-position-summary">
                        <div><span>Valeur actuelle</span><strong>{formatCurrency(savingsPosition.marketValue, 'EUR')}</strong></div>
                        <div><span>Capital de référence</span><strong>{hasManualPerformance ? formatCurrency(savingsPosition.costBasis, 'EUR') : '—'}</strong></div>
                        <div><span>Plus-value / moins-value</span><strong className={hasManualPerformance ? savingsPosition.unrealizedPnL > 0 ? 'text-success' : savingsPosition.unrealizedPnL < 0 ? 'text-danger' : 'text-secondary' : 'text-secondary'}>{hasManualPerformance ? formatCurrency(savingsPosition.unrealizedPnL, 'EUR') : 'Non renseignée'}</strong></div>
                        <p>Pour modifier ces chiffres, ouvre le tableau de bord de l’épargne salariale.</p>
                    </div>
                ) : (
                    <div className="empty-state"><p>Renseigne ton solde depuis le tableau de bord pour commencer.</p></div>
                )}
            </div>
        )
    }

    if (portfolioScope === 'cash') {
        const total = MANUAL_CASH_ASSETS.reduce((sum, asset) => sum + (Number(cashData[asset.key]) || 0), 0)
        return (
            <div className="card positions-card">
                <div className="positions-header">
                    <div>
                        <h2 className="card-title">Livrets</h2>
                        <p className="card-subtitle">Soldes saisis manuellement, sans suivi de performance.</p>
                    </div>
                </div>
                <div className="manual-cash-position-summary">
                    {MANUAL_CASH_ASSETS.map((asset) => (
                        <div key={asset.key}><span>{asset.name}</span><strong>{formatCurrency(Number(cashData[asset.key]) || 0, 'EUR')}</strong></div>
                    ))}
                    <div className="manual-cash-position-total"><span>Total des livrets</span><strong>{formatCurrency(total, 'EUR')}</strong></div>
                    <p>Pour modifier ces montants, ouvre le tableau de bord des livrets.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="card positions-card">
            <div className="positions-header">
                <div>
                    <h2 className="card-title">{portfolioScope === 'savings' ? 'Épargne salariale' : 'Positions ouvertes'}</h2>
                    <p className="card-subtitle">
                        {portfolioScope === 'savings'
                            ? 'Valeur globale et performance saisies depuis ton relevé.'
                            : 'Suivez en temps réel la valorisation, le PRU et les plus-values latentes de vos investissements.'}
                    </p>
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
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filtrer par étiquette">
                    <option value="">Toutes les étiquettes</option>
                    {tagCatalog.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
                <select value={sortField} onChange={(e) => setSortField(e.target.value)} aria-label="Trier les positions">
                    <option value="marketValue">Trier : valeur</option>
                    <option value="ticker">Trier : nom</option>
                    <option value="tags">Trier : étiquette</option>
                    <option value="unrealizedPnL">Trier : performance</option>
                </select>
            </div>

            {filteredPositions.length === 0 ? (
                <div className="empty-state">
                    {positions.length === 0 ? (
                        <>
                            <div className="empty-state-icon">💼</div>
                            <h3>Aucune position ouverte</h3>
                            {portfolioScope === 'savings' ? (
                                <p>Renseigne ton solde depuis le tableau de bord pour suivre ton épargne salariale.</p>
                            ) : <>
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
                            </>}
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
                                        PRU <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('costBasis')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Investi <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('currentPrice')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Cours <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('marketValue')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Valeur <ArrowUpDown size={12} />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('unrealizedPnL')} className="sortable-th text-right">
                                    <div className="th-content justify-end">
                                        Gain / Perte <ArrowUpDown size={12} />
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
                                const isPos = pos.unrealizedPnLNative >= 0
                                const isManualSavings = pos.isManualSavings || pos.ticker === MANUAL_SAVINGS_TICKER
                                const isManualCash = Boolean(pos.isManualCash)
                                const isManualPosition = isManualSavings || isManualCash
                                const hasManualPerformance = !isManualSavings || Boolean(pos.hasManualPerformance)
                                const portfolioType = assetMetadata[pos.ticker]?.portfolioType || (isCryptoTicker(pos.ticker, pos.name) ? 'crypto' : 'stocks')
                                const isCrypto = portfolioType === 'crypto'
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
                                                    <span className="ticker-sym">{formatAssetName(pos.name, pos.ticker)}</span>
                                                    {isManualSavings && <span className="asset-tag-chip">Saisie manuelle</span>}
                                                    {isManualCash && <span className="asset-tag-chip">Livret</span>}
                                                    {pos.currency !== 'EUR' && (
                                                        <span className="badge badge-buy" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                                                            {pos.currency}
                                                        </span>
                                                    )}
                                                </div>
                                                {!isManualPosition && <div className="asset-tag-chips">
                                                    {(Array.isArray(assetMetadata[pos.ticker]?.tags) ? assetMetadata[pos.ticker].tags : String(assetMetadata[pos.ticker]?.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean)).map((tag) => (
                                                        <span className="asset-tag-chip" key={tag}>{tag}</span>
                                                    ))}
                                                </div>}
                                                {!isManualPosition && <details className="tag-picker"><summary>Gérer les étiquettes</summary>
                                                    {tagCatalog.map((tag) => {
                                                        const current = assetMetadata[pos.ticker]?.tags || []
                                                        const selected = Array.isArray(current) ? current : String(current).split(',').map((item) => item.trim())
                                                        return <label key={tag}><input type="checkbox" checked={selected.includes(tag)} onChange={(e) => onAssetMetadataChange?.(pos.ticker, { tags: e.target.checked ? [...selected, tag] : selected.filter((item) => item !== tag) })} />{tag}</label>
                                                    })}
                                                </details>}
                                                {!isManualPosition && <details className="asset-classification-editor">
                                                    <summary>{isCrypto ? 'Catégorie' : 'Secteur, pays et catégorie'}</summary>
                                                    <label>Type de portefeuille
                                                        <select value={assetMetadata[pos.ticker]?.portfolioType || (isCryptoTicker(pos.ticker, pos.name) ? 'crypto' : 'stocks')} onChange={(event) => onAssetMetadataChange?.(pos.ticker, { portfolioType: event.target.value })}>
                                                            <option value="stocks">Bourse</option>
                                                            <option value="crypto">Crypto</option>
                                                        </select>
                                                    </label>
                                                    {!isCrypto && <>
                                                        <label>Secteur
                                                            <input type="text" value={assetMetadata[pos.ticker]?.sector || ''} placeholder="Automatique si vide" onChange={(event) => onAssetMetadataChange?.(pos.ticker, { sector: event.target.value })} />
                                                        </label>
                                                        <label>Pays
                                                            <input type="text" value={assetMetadata[pos.ticker]?.country || ''} placeholder="Automatique si vide" onChange={(event) => onAssetMetadataChange?.(pos.ticker, { country: event.target.value })} />
                                                        </label>
                                                    </>}
                                                </details>}
                                            </div>
                                        </td>
                                        <td className="text-right font-mono font-medium">
                                            {isManualPosition ? '—' : formatQty(pos.quantity)}
                                        </td>
                                        <td className="text-right font-mono pru-cell" title={isManualPosition ? 'Montant suivi sans quantité ni PRU par part' : 'Double-cliquez pour modifier le PRU'}>
                                            {isManualPosition ? '—' : editingPru?.ticker === pos.ticker ? (
                                                <input autoFocus className="price-input pru-edit-input" type="number" min="0.000001" step="any" value={editingPru.value} onChange={(e) => setEditingPru({ ...editingPru, value: e.target.value })} onBlur={() => { const value = Number(String(editingPru.value).replace(',', '.')); if (value > 0) onAssetMetadataChange?.(pos.ticker, { pruOverride: value }); setEditingPru(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingPru(null) }} />
                                            ) : (
                                                <button type="button" className="pru-edit-button" onDoubleClick={() => setEditingPru({ ticker: pos.ticker, value: String(pos.averageCost) })} title="Double-cliquez pour modifier le PRU">
                                                    {formatCurrency(pos.averageCost, pos.currency)}
                                                </button>
                                            )}
                                        </td>
                                        <td className="text-right font-mono text-secondary">
                                            {isManualCash || (isManualSavings && !hasManualPerformance) ? '—' : formatCurrency(pos.costBasisNative, pos.currency)}
                                        </td>
                                        <td className="text-right">
                                            {isManualPosition ? <span className="manual-position-note">{isManualCash ? 'Solde saisi' : 'Valeur saisie'}</span> : <div className="price-input-wrapper">
                                                <input
                                                    className="price-input"
                                                    type="number"
                                                    min="0.0001"
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
                                                    title={`Modifiez le cours en ${pos.currency}`}
                                                />
                                            </div>}
                                        </td>
                                        <td className="text-right font-mono font-bold">
                                            {formatCurrency(pos.marketValueNative, pos.currency)}
                                        </td>
                                        <td className="text-right">
                                            {isManualCash || (isManualSavings && !hasManualPerformance) ? <span className="manual-position-note">{isManualSavings ? 'Non renseignée' : '—'}</span> : <>
                                                <div className={`pnl-badge ${isPos ? 'pos' : 'neg'}`}>
                                                    {formatCurrency(pos.unrealizedPnLNative, pos.currency)}
                                                </div>
                                                <div className={`pnl-sub ${isPos ? 'pos' : 'neg'}`}>
                                                    {formatPercent(pos.unrealizedPctNative, true)}
                                                </div>
                                            </>}
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
                                            {isManualPosition ? <span className="manual-position-note">{isManualCash ? 'Modifiable dans Livret A & LEP' : 'Modifiable au tableau de bord'}</span> : <div className="action-btn-group">
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
                                                            currency: pos.currency,
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
                                                            currency: pos.currency,
                                                            quantity: pos.quantity,
                                                        })
                                                    }
                                                >
                                                    <MinusCircle size={15} />
                                                    <span>Vente</span>
                                                </button>
                                            </div>}
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
