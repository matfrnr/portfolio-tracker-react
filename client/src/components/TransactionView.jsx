import { useEffect, useMemo, useState, useRef } from 'react'
import {
    formatCurrency,
    formatQty,
    toISODateString,
    getAvailableQuantity,
    parseNumber,
    getTodayISODate,
} from '../lib/portfolio'
import { searchTickers, fetchLiveQuotes } from '../api/prices'
import {
    Search,
    TrendingUp,
    TrendingDown,
    Calendar,
    Coins,
    FileText,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    X,
    DollarSign,
    Euro,
} from 'lucide-react'

const emptyForm = {
    type: 'BUY',
    ticker: '',
    name: '',
    currency: 'EUR',
    date: getTodayISODate(),
    quantity: '',
    unitPrice: '',
    currentPrice: '',
    fees: '0',
    note: '',
}

export default function TransactionView({
    onSaveTransaction,
    editingTransaction,
    onCancelEdit,
    currentPrice,
    transactions = [],
    prefillData = null,
    forexRate = 1.085,
}) {
    const [form, setForm] = useState(emptyForm)
    const [suggestions, setSuggestions] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const [showSuggestions, setShowSuggestions] = useState(false)
    const searchTimeoutRef = useRef(null)
    const suggestionBoxRef = useRef(null)

    // Charger les données en cas d'édition ou de préremplissage
    useEffect(() => {
        if (editingTransaction) {
            setForm({
                type: editingTransaction.type,
                ticker: editingTransaction.ticker,
                name: editingTransaction.name || '',
                currency: editingTransaction.currency || (editingTransaction.ticker.endsWith('.PA') ? 'EUR' : 'USD'),
                date: toISODateString(editingTransaction.date),
                quantity: String(editingTransaction.quantity),
                unitPrice: String(editingTransaction.unitPrice),
                currentPrice:
                    currentPrice !== '' && currentPrice !== null && currentPrice !== undefined
                        ? String(currentPrice)
                        : '',
                fees: String(editingTransaction.fees ?? 0),
                note: editingTransaction.note || '',
            })
        } else if (prefillData) {
            const detectedCurr = prefillData.currency || (prefillData.ticker?.endsWith('.PA') ? 'EUR' : 'USD')
            setForm({
                ...emptyForm,
                type: prefillData.type || 'BUY',
                ticker: prefillData.ticker || '',
                name: prefillData.name || '',
                currency: detectedCurr,
                unitPrice: prefillData.currentPrice ? String(prefillData.currentPrice) : '',
                currentPrice: prefillData.currentPrice ? String(prefillData.currentPrice) : '',
                date: getTodayISODate(),
            })
        } else {
            setForm({
                ...emptyForm,
                date: getTodayISODate(),
            })
        }
    }, [editingTransaction, currentPrice, prefillData])

    // Fermer les suggestions lors d'un clic extérieur
    useEffect(() => {
        function handleClickOutside(e) {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(e.target)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Quantité disponible actuellement pour ce ticker
    const availableQty = useMemo(() => {
        if (!form.ticker) return 0
        return getAvailableQuantity(
            transactions,
            form.ticker,
            editingTransaction ? editingTransaction.id : null,
        )
    }, [form.ticker, transactions, editingTransaction])

    // Calculs de total
    const { gross, total } = useMemo(() => {
        const quantity = parseNumber(form.quantity, 0)
        const unitPrice = parseNumber(form.unitPrice, 0)
        const fees = parseNumber(form.fees, 0)
        const grossAmount = quantity * unitPrice
        const netAmount = form.type === 'SELL' ? grossAmount - fees : grossAmount + fees

        return {
            gross: grossAmount,
            total: netAmount,
        }
    }, [form.quantity, form.unitPrice, form.fees, form.type])

    function updateField(name, value) {
        setForm((current) => ({ ...current, [name]: value }))

        if (name === 'ticker') {
            const query = value.trim()
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current)
            }

            if (query.length >= 1) {
                setIsSearching(true)
                setShowSuggestions(true)
                searchTimeoutRef.current = setTimeout(async () => {
                    try {
                        const results = await searchTickers(query)
                        setSuggestions(results)
                    } catch (err) {
                        setSuggestions([])
                    } finally {
                        setIsSearching(false)
                    }
                }, 300)
            } else {
                setSuggestions([])
                setShowSuggestions(false)
                setIsSearching(false)
            }
        }
    }

    async function handleSelectSuggestion(suggestion) {
        const symbol = suggestion.symbol.toUpperCase()
        setShowSuggestions(false)
        const detectedCurr = suggestion.currency || (symbol.endsWith('.PA') || symbol.endsWith('.MC') ? 'EUR' : 'USD')

        setForm((prev) => ({
            ...prev,
            ticker: symbol,
            name: suggestion.name || symbol,
            currency: detectedCurr,
        }))

        // Récupérer le cours en direct
        try {
            const quotes = await fetchLiveQuotes([symbol])
            if (quotes[symbol]?.price) {
                const livePrice = quotes[symbol].price
                const quoteCurr = quotes[symbol].currency || detectedCurr
                setForm((prev) => ({
                    ...prev,
                    currency: quoteCurr,
                    unitPrice: prev.unitPrice ? prev.unitPrice : String(livePrice),
                    currentPrice: String(livePrice),
                }))
            }
        } catch (err) {
            console.warn('Impossible de récupérer le cours en direct pour la suggestion', err)
        }
    }

    function handleSubmit(event) {
        event.preventDefault()

        const cleanQty = parseNumber(form.quantity, 0)
        const cleanUnitPrice = parseNumber(form.unitPrice, 0)
        const cleanFees = parseNumber(form.fees, 0)
        const hasCurrentPrice = form.currentPrice !== '' && form.currentPrice !== null && form.currentPrice !== undefined
        const cleanCurrentPrice = hasCurrentPrice ? parseNumber(form.currentPrice, null) : null
        const selectedCurrency = form.currency === 'USD' ? 'USD' : 'EUR'
        const cleanExchangeRate = selectedCurrency === 'USD' ? (forexRate || 1.085) : 1.0

        onSaveTransaction({
            ...form,
            type: form.type,
            ticker: form.ticker.trim().toUpperCase(),
            name: form.name.trim() || form.ticker.trim().toUpperCase(),
            date: form.date,
            currency: selectedCurrency,
            exchangeRate: cleanExchangeRate,
            quantity: cleanQty,
            unitPrice: cleanUnitPrice,
            currentPrice: cleanCurrentPrice,
            fees: cleanFees,
        })
    }

    function handleReset() {
        if (editingTransaction) {
            onCancelEdit()
        }
        setForm({
            ...emptyForm,
            date: getTodayISODate(),
        })
        setShowSuggestions(false)
    }

    const currencySymbol = form.currency === 'USD' ? '$' : '€'

    return (
        <div className="card form-card">
            <div className="form-header">
                <div>
                    <h2 className="card-title">
                        {editingTransaction ? 'Modifier la transaction' : 'Nouvelle transaction'}
                    </h2>
                    <p className="card-subtitle">
                        {editingTransaction
                            ? 'Mettez à jour les détails de cette opération.'
                            : "Enregistrez un ordre d'achat ou de vente en Euros ou en Dollars."}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Sélecteur de Type Achat / Vente */}
                    <div className="type-toggle">
                        <button
                            type="button"
                            className={form.type === 'BUY' ? 'type-btn active buy' : 'type-btn'}
                            onClick={() => updateField('type', 'BUY')}
                        >
                            <TrendingUp size={16} />
                            Achat
                        </button>
                        <button
                            type="button"
                            className={form.type === 'SELL' ? 'type-btn active sell' : 'type-btn'}
                            onClick={() => updateField('type', 'SELL')}
                        >
                            <TrendingDown size={16} />
                            Vente
                        </button>
                    </div>

                    {/* Sélecteur de Devise EUR / USD */}
                    <div className="type-toggle">
                        <button
                            type="button"
                            className={form.currency === 'EUR' ? 'type-btn active' : 'type-btn'}
                            onClick={() => updateField('currency', 'EUR')}
                            title="Transaction libellée en Euros (€)"
                        >
                            <Euro size={15} />
                            EUR (€)
                        </button>
                        <button
                            type="button"
                            className={form.currency === 'USD' ? 'type-btn active' : 'type-btn'}
                            onClick={() => updateField('currency', 'USD')}
                            title="Transaction libellée en Dollars américains ($)"
                        >
                            <DollarSign size={15} />
                            USD ($)
                        </button>
                    </div>
                </div>
            </div>

            {form.type === 'SELL' && form.ticker && (
                <div className="info-banner">
                    <AlertCircle size={16} />
                    <span>
                        Quantité actuellement disponible pour <strong>{form.ticker.toUpperCase()}</strong> :{' '}
                        <strong>{formatQty(availableQty)}</strong> part(s).
                    </span>
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="form-grid">
                    {/* Ticker avec autocomplétion */}
                    <div className="form-field full-width" ref={suggestionBoxRef} style={{ position: 'relative' }}>
                        <label>
                            Ticker / Symbole boursier <span className="required">*</span>
                        </label>
                        <div className="input-with-icon">
                            <Search size={16} className="input-icon" />
                            <input
                                value={form.ticker}
                                onChange={(e) => updateField('ticker', e.target.value)}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                placeholder="ex. AAPL, MC.PA, CW8.PA, MSFT, NVDA..."
                                required
                                autoComplete="off"
                            />
                            {isSearching && <span className="input-spinner" />}
                        </div>

                        {showSuggestions && suggestions.length > 0 && (
                            <div className="suggestions-dropdown">
                                {suggestions.map((item) => (
                                    <div
                                        key={item.symbol}
                                        className="suggestion-item"
                                        onClick={() => handleSelectSuggestion(item)}
                                    >
                                        <div>
                                            <span className="suggestion-symbol">{item.symbol}</span>
                                            <span className="suggestion-name">{item.name}</span>
                                        </div>
                                        <span className="suggestion-exchange">
                                            {item.currency ? `[${item.currency}] ` : ''}{item.exchange}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Nom de l'actif */}
                    <div className="form-field">
                        <label>Nom de l'actif</label>
                        <input
                            value={form.name}
                            onChange={(e) => updateField('name', e.target.value)}
                            placeholder="ex. Apple Inc., LVMH..."
                        />
                    </div>

                    {/* Date */}
                    <div className="form-field">
                        <label>
                            Date de l'opération <span className="required">*</span>
                        </label>
                        <div className="input-with-icon">
                            <Calendar size={16} className="input-icon" />
                            <input
                                type="date"
                                value={form.date}
                                onChange={(e) => updateField('date', e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* Quantité */}
                    <div className="form-field">
                        <label>
                            Quantité de titres <span className="required">*</span>
                        </label>
                        <input
                            type="number"
                            min="0.0001"
                            step="any"
                            value={form.quantity}
                            onChange={(e) => updateField('quantity', e.target.value)}
                            placeholder="ex. 10 ou 1.5"
                            required
                        />
                    </div>

                    {/* Prix unitaire */}
                    <div className="form-field">
                        <label>
                            {form.type === 'BUY'
                                ? `Prix d'achat unitaire (${currencySymbol})`
                                : `Prix de vente unitaire (${currencySymbol})`}{' '}
                            <span className="required">*</span>
                        </label>
                        <input
                            type="number"
                            min="0.0001"
                            step="any"
                            value={form.unitPrice}
                            onChange={(e) => updateField('unitPrice', e.target.value)}
                            placeholder={`ex. ${form.currency === 'USD' ? '225.50' : '185.50'}`}
                            required
                        />
                    </div>

                    {/* Cours actuel */}
                    <div className="form-field">
                        <label>Cours actuel du marché ({currencySymbol})</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={form.currentPrice}
                            onChange={(e) => updateField('currentPrice', e.target.value)}
                            placeholder={`ex. ${form.currency === 'USD' ? '230.00' : '190.00'} (optionnel)`}
                        />
                        <span className="hint">
                            Évalue la plus-value latente immédiatement.
                        </span>
                    </div>

                    {/* Frais */}
                    <div className="form-field">
                        <label>Frais de courtage ({currencySymbol})</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={form.fees}
                            onChange={(e) => updateField('fees', e.target.value)}
                            placeholder="0.00"
                        />
                    </div>

                    {/* Note */}
                    <div className="form-field full-width">
                        <label>Note / Commentaire (optionnel)</label>
                        <input
                            value={form.note}
                            onChange={(e) => updateField('note', e.target.value)}
                            placeholder="ex. Achat NASDAQ, dividende réinvesti, DCA mensuel..."
                        />
                    </div>
                </div>

                {/* Récapitulatif financier interactif */}
                <div className="total-preview-box">
                    <div className="total-preview-item">
                        <span className="preview-label">Montant brut :</span>
                        <span className="preview-val">{formatCurrency(gross, form.currency)}</span>
                    </div>
                    <div className="total-preview-item">
                        <span className="preview-label">Frais :</span>
                        <span className="preview-val">{formatCurrency(parseNumber(form.fees, 0), form.currency)}</span>
                    </div>
                    <div className="total-preview-divider" />
                    <div className="total-preview-item highlight">
                        <span className="preview-label">
                            {form.type === 'SELL' ? 'Montant net crédité :' : 'Total net investi :'}
                        </span>
                        <span className="preview-val total-amount">{formatCurrency(total, form.currency)}</span>
                    </div>
                    {form.currency === 'USD' && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Conversion portefeuille : ≈{' '}
                            <strong style={{ color: 'var(--text-primary)' }}>
                                {formatCurrency(total / (forexRate || 1.085), 'EUR')}
                            </strong>{' '}
                            (taux EUR/USD : {Number(forexRate || 1.085).toFixed(4)})
                        </div>
                    )}
                </div>

                <div className="btn-row">
                    <button type="button" className="btn-secondary" onClick={handleReset}>
                        {editingTransaction ? 'Annuler la modification' : 'Effacer le formulaire'}
                    </button>
                    <button type="submit" className="btn-primary">
                        <CheckCircle2 size={16} />
                        {editingTransaction ? 'Enregistrer les modifications' : 'Confirmer la transaction'}
                    </button>
                </div>
            </form>
        </div>
    )
}