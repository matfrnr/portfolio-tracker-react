import { useEffect, useMemo, useState, useRef } from 'react'
import {
    formatCurrency,
    formatQty,
    toISODateString,
    getAvailableQuantity,
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
} from 'lucide-react'

const emptyForm = {
    type: 'BUY',
    ticker: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
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
            setForm({
                ...emptyForm,
                type: prefillData.type || 'BUY',
                ticker: prefillData.ticker || '',
                name: prefillData.name || '',
                unitPrice: prefillData.currentPrice ? String(prefillData.currentPrice) : '',
                currentPrice: prefillData.currentPrice ? String(prefillData.currentPrice) : '',
                date: new Date().toISOString().split('T')[0],
            })
        } else {
            setForm({
                ...emptyForm,
                date: new Date().toISOString().split('T')[0],
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
        const quantity = Number(form.quantity || 0)
        const unitPrice = Number(form.unitPrice || 0)
        const fees = Number(form.fees || 0)
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
        setForm((prev) => ({
            ...prev,
            ticker: symbol,
            name: suggestion.name || symbol,
        }))

        // Récupérer le cours en direct
        try {
            const quotes = await fetchLiveQuotes([symbol])
            if (quotes[symbol]?.price) {
                const livePrice = quotes[symbol].price
                setForm((prev) => ({
                    ...prev,
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

        onSaveTransaction({
            ...form,
            ticker: form.ticker.trim().toUpperCase(),
            name: form.name.trim() || form.ticker.trim().toUpperCase(),
            date: form.date,
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
            currentPrice:
                form.currentPrice === '' || isNaN(Number(form.currentPrice))
                    ? null
                    : Number(form.currentPrice),
            fees: Number(form.fees || 0),
        })
    }

    function handleReset() {
        if (editingTransaction) {
            onCancelEdit()
        }
        setForm({
            ...emptyForm,
            date: new Date().toISOString().split('T')[0],
        })
        setShowSuggestions(false)
    }

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
                            : "Enregistrez un achat ou une vente d'action, ETF ou crypto."}
                    </p>
                </div>

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
                                placeholder="ex. AAPL, MC.PA, CW8.PA, MSFT..."
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
                                        <span className="suggestion-exchange">{item.exchange}</span>
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
                            {form.type === 'BUY' ? "Prix d'achat unitaire (€)" : 'Prix de vente unitaire (€)'}{' '}
                            <span className="required">*</span>
                        </label>
                        <input
                            type="number"
                            min="0.0001"
                            step="any"
                            value={form.unitPrice}
                            onChange={(e) => updateField('unitPrice', e.target.value)}
                            placeholder="ex. 185.50"
                            required
                        />
                    </div>

                    {/* Cours actuel */}
                    <div className="form-field">
                        <label>Cours actuel du marché (€)</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={form.currentPrice}
                            onChange={(e) => updateField('currentPrice', e.target.value)}
                            placeholder="ex. 192.00 (optionnel)"
                        />
                        <span className="hint">
                            Permet d'évaluer la plus-value latente immédiatement.
                        </span>
                    </div>

                    {/* Frais */}
                    <div className="form-field">
                        <label>Frais de courtage / transaction (€)</label>
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
                            placeholder="ex. DCA mensuel, rééquilibrage, dividende réinvesti..."
                        />
                    </div>
                </div>

                {/* Récapitulatif financier interactif */}
                <div className="total-preview-box">
                    <div className="total-preview-item">
                        <span className="preview-label">Montant brut :</span>
                        <span className="preview-val">{formatCurrency(gross)}</span>
                    </div>
                    <div className="total-preview-item">
                        <span className="preview-label">Frais :</span>
                        <span className="preview-val">{formatCurrency(Number(form.fees || 0))}</span>
                    </div>
                    <div className="total-preview-divider" />
                    <div className="total-preview-item highlight">
                        <span className="preview-label">
                            {form.type === 'SELL' ? 'Montant net crédité :' : 'Total net investi :'}
                        </span>
                        <span className="preview-val total-amount">{formatCurrency(total)}</span>
                    </div>
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