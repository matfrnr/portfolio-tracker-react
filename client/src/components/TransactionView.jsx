import { useEffect, useMemo, useState, useRef } from 'react'
import {
    formatCurrency,
    formatQty,
    toISODateString,
    getAvailableQuantity,
    exchangeRateFor,
    hasExchangeRate,
    defaultCurrencyForTicker,
    parseNumber,
    getTodayISODate,
} from '../lib/portfolio'
import { searchTickers, fetchLiveQuotes, getForexRate } from '../api/prices'
import {
    Search,
    TrendingUp,
    TrendingDown,
    Calendar,
    Coins,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react'

const emptyForm = {
    type: 'BUY',
    ticker: '',
    name: '',
    currency: 'EUR',
    exchangeRate: '1',
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
    positions = [],
    currencies = {},
    prefillData = null,
    forexRate = 1.085,
    forexRates = { EUR: 1, USD: forexRate },
}) {
    const [form, setForm] = useState(emptyForm)
    const [suggestions, setSuggestions] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const [showSuggestions, setShowSuggestions] = useState(false)
    const searchTimeoutRef = useRef(null)
    const suggestionBoxRef = useRef(null)

    const transactionAssets = useMemo(() => {
        const assets = positions.map((position) => ({
            ticker: position.ticker,
            name: position.name || position.ticker,
            currency: position.currency || currencies[position.ticker] || defaultCurrencyForTicker(position.ticker),
            currentPrice: position.currentPrice,
        }))
        if (editingTransaction?.ticker && !assets.some((asset) => asset.ticker === editingTransaction.ticker)) {
            assets.push({
                ticker: editingTransaction.ticker,
                name: editingTransaction.name || editingTransaction.ticker,
                currency: editingTransaction.currency || currencies[editingTransaction.ticker] || defaultCurrencyForTicker(editingTransaction.ticker),
                currentPrice: '',
            })
        }
        return assets.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    }, [positions, currencies, editingTransaction?.id, editingTransaction?.ticker])

    // Charger les données en cas d'édition ou de préremplissage
    useEffect(() => {
        if (editingTransaction) {
            const editCurrency = editingTransaction.currency || currencies[editingTransaction.ticker] || defaultCurrencyForTicker(editingTransaction.ticker)
            const savedRate = Number(editingTransaction.exchangeRate)
            const hasSavedRate = savedRate > 0 && !(editCurrency === 'USD' && savedRate === 1)
            setForm({
                type: editingTransaction.type,
                ticker: editingTransaction.ticker,
                name: editingTransaction.name || '',
                currency: editCurrency,
                exchangeRate: editCurrency === 'EUR' ? '1' : hasSavedRate ? String(savedRate) : '',
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
            const detectedCurr = prefillData.currency || defaultCurrencyForTicker(prefillData.ticker)
            const prefillRate = exchangeRateFor(detectedCurr, forexRates, forexRate)
            setForm({
                ...emptyForm,
                type: prefillData.type || 'BUY',
                ticker: prefillData.ticker || '',
                name: prefillData.name || '',
                currency: detectedCurr,
                exchangeRate: detectedCurr === 'EUR' || hasExchangeRate(detectedCurr, forexRates) ? String(prefillRate) : '',
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
    }, [editingTransaction?.id, prefillData?.ticker, prefillData?.type])

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
        const grossAmount = form.type === 'DIVIDEND' ? unitPrice : quantity * unitPrice
        const netAmount = form.type === 'BUY' ? grossAmount + fees : grossAmount - fees

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

    function handleTypeChange(type) {
        if (type === 'BUY') {
            updateField('type', type)
            return
        }
        const selected = transactionAssets.find((asset) => asset.ticker === form.ticker) || transactionAssets[0]
        const currency = selected?.currency || form.currency
        setForm((current) => ({
            ...current,
            type,
            ticker: selected?.ticker || '',
            name: selected?.name || '',
            currency,
            exchangeRate: currency === 'EUR' || hasExchangeRate(currency, forexRates)
                ? String(exchangeRateFor(currency, forexRates, forexRate))
                : '',
            currentPrice: selected?.currentPrice ? String(selected.currentPrice) : current.currentPrice,
        }))
    }

    function handleSelectOwnedAsset(ticker) {
        const selected = transactionAssets.find((asset) => asset.ticker === ticker)
        if (!selected) return
        const currency = selected.currency || defaultCurrencyForTicker(ticker)
        setForm((current) => ({
            ...current,
            ticker: selected.ticker,
            name: selected.name,
            currency,
            exchangeRate: currency === 'EUR' || hasExchangeRate(currency, forexRates)
                ? String(exchangeRateFor(currency, forexRates, forexRate))
                : '',
            currentPrice: selected.currentPrice ? String(selected.currentPrice) : current.currentPrice,
        }))
    }

    async function handleSelectSuggestion(suggestion) {
        const symbol = suggestion.symbol.toUpperCase()
        setShowSuggestions(false)
        const detectedCurr = suggestion.currency || defaultCurrencyForTicker(symbol)

        setForm((prev) => ({
            ...prev,
            ticker: symbol,
            name: suggestion.name || symbol,
            currency: detectedCurr,
            exchangeRate: detectedCurr === 'EUR' || hasExchangeRate(detectedCurr, forexRates)
                ? String(exchangeRateFor(detectedCurr, forexRates, forexRate))
                : '',
        }))

        // Récupérer le cours en direct
        try {
            const quotes = await fetchLiveQuotes([symbol])
            if (quotes[symbol]?.price) {
                const livePrice = quotes[symbol].price
                const quoteCurr = quotes[symbol].currency || detectedCurr
                let quoteRate = exchangeRateFor(quoteCurr, forexRates, forexRate)
                let quoteRateAvailable = quoteCurr === 'EUR' || hasExchangeRate(quoteCurr, forexRates)
                try {
                    const forex = await getForexRate([quoteCurr])
                    const fetchedRate = Number(forex?.rates?.[quoteCurr])
                    if (fetchedRate > 0) {
                        quoteRate = fetchedRate
                        quoteRateAvailable = true
                    }
                } catch {}
                setForm((prev) => ({
                    ...prev,
                    currency: quoteCurr,
                    exchangeRate: quoteCurr === 'EUR' ? '1' : quoteRateAvailable ? String(quoteRate) : '',
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

        const cleanQty = form.type === 'DIVIDEND' ? 1 : parseNumber(form.quantity, 0)
        const cleanUnitPrice = parseNumber(form.unitPrice, 0)
        const cleanFees = parseNumber(form.fees, 0)
        const hasCurrentPrice = form.currentPrice !== '' && form.currentPrice !== null && form.currentPrice !== undefined
        const cleanCurrentPrice = hasCurrentPrice ? parseNumber(form.currentPrice, null) : null
        const selectedCurrency = form.currency || 'EUR'
        const cleanExchangeRate = selectedCurrency === 'EUR'
            ? 1
            : parseNumber(form.exchangeRate, 0)

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

    const currencySymbol = (() => {
        try {
            return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: form.currency, maximumFractionDigits: 0 })
                .formatToParts(0)
                .find((part) => part.type === 'currency')?.value || form.currency
        } catch {
            return form.currency
        }
    })()

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
                            : 'Saisissez un achat, une vente ou un dividende avec sa devise et son taux de change historique.'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Type d'opération */}
                    <div className="type-toggle">
                        <button
                            type="button"
                            className={form.type === 'BUY' ? 'type-btn active buy' : 'type-btn'}
                            onClick={() => handleTypeChange('BUY')}
                        >
                            <TrendingUp size={16} />
                            Achat
                        </button>
                        <button
                            type="button"
                            className={form.type === 'SELL' ? 'type-btn active sell' : 'type-btn'}
                            onClick={() => handleTypeChange('SELL')}
                        >
                            <TrendingDown size={16} />
                            Vente
                        </button>
                        <button
                            type="button"
                            className={form.type === 'DIVIDEND' ? 'type-btn active dividend' : 'type-btn'}
                            onClick={() => handleTypeChange('DIVIDEND')}
                        >
                            <Coins size={16} />
                            Dividende
                        </button>
                    </div>

                    {/* Devise de règlement */}
                    <div className="form-field currency-field">
                        <label htmlFor="transaction-currency">Devise</label>
                        <select
                            id="transaction-currency"
                            value={form.currency}
                            onChange={(e) => setForm((current) => ({
                                ...current,
                                currency: e.target.value,
                                exchangeRate: e.target.value === 'EUR' || hasExchangeRate(e.target.value, forexRates)
                                    ? String(exchangeRateFor(e.target.value, forexRates, forexRate))
                                    : '',
                            }))}
                        >
                            {[...new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'SEK', 'NOK', 'DKK', 'CNY', 'HKD', 'NZD', 'SGD', form.currency])].map((currency) => (
                                <option key={currency} value={currency}>{currency}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {form.type === 'SELL' && form.ticker && (
                <div className="info-banner">
                    <AlertCircle size={16} />
                    <span>
                        Quantité actuellement disponible pour <strong>{form.name || form.ticker}</strong> ({form.ticker.toUpperCase()}) :{' '}
                        <strong>{formatQty(availableQty)}</strong> part(s).
                    </span>
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="form-grid">
                    {form.type === 'BUY' ? (
                        <>
                            {/* Recherche d'un nouvel actif pour les achats */}
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
                                                    <span className="suggestion-name">{item.name}</span>
                                                    <span className="suggestion-symbol">{item.symbol}</span>
                                                </div>
                                                <span className="suggestion-exchange">
                                                    {item.currency ? `[${item.currency}] ` : ''}{item.exchange}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="form-field">
                                <label>Nom de l'actif</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => updateField('name', e.target.value)}
                                    placeholder="ex. Apple Inc., LVMH..."
                                />
                            </div>
                        </>
                    ) : (
                        <div className="form-field full-width">
                            <label htmlFor="owned-asset-select">Actif détenu <span className="required">*</span></label>
                            <select
                                id="owned-asset-select"
                                className="owned-asset-select"
                                value={form.ticker}
                                onChange={(event) => handleSelectOwnedAsset(event.target.value)}
                                required
                                disabled={transactionAssets.length === 0}
                            >
                                <option value="">{transactionAssets.length ? 'Choisir un actif détenu…' : 'Aucune position détenue'}</option>
                                {transactionAssets.map((asset) => (
                                    <option key={asset.ticker} value={asset.ticker}>{asset.name} — {asset.ticker}</option>
                                ))}
                            </select>
                            {transactionAssets.length === 0 && <span className="hint">Ajoute d’abord un achat pour enregistrer une vente ou un dividende.</span>}
                        </div>
                    )}

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

                    {/* Quantité de titres */}
                    {form.type !== 'DIVIDEND' && <div className="form-field">
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
                    </div>}

                    {/* Prix unitaire */}
                    <div className="form-field">
                        <label>
                            {form.type === 'DIVIDEND'
                                ? `Montant brut du dividende (${currencySymbol})`
                                : form.type === 'BUY'
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
                    {form.type !== 'DIVIDEND' && <div className="form-field">
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
                    </div>}

                    {/* Frais */}
                    <div className="form-field">
                        <label>{form.type === 'DIVIDEND' ? `Retenue fiscale / frais (${currencySymbol})` : `Frais de courtage (${currencySymbol})`}</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={form.fees}
                            onChange={(e) => updateField('fees', e.target.value)}
                            placeholder="0.00"
                        />
                    </div>

                    {form.currency !== 'EUR' && (
                        <div className="form-field">
                            <label>Taux historique (1 € = {form.currency})</label>
                            <input
                                type="number"
                                min="0.000001"
                                step="any"
                                value={form.exchangeRate}
                                onChange={(e) => updateField('exchangeRate', e.target.value)}
                                required
                            />
                            <span className="hint">
                                {!form.exchangeRate
                                    ? 'Aucun taux historique enregistré. Saisissez-le depuis votre relevé; ne reprenez le taux actuel que si vous n’avez pas la valeur historique.'
                                    : hasExchangeRate(form.currency, forexRates)
                                        ? "Saisissez le taux de la date de l'opération pour une conversion historique fidèle."
                                        : "Taux actuel indisponible; saisissez le taux de votre relevé. 1 € doit correspondre au nombre d'unités indiqué."}
                            </span>
                        </div>
                    )}

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
                            {form.type === 'BUY' ? 'Total débité :' : form.type === 'SELL' ? 'Montant net crédité :' : 'Dividende net perçu :'}
                        </span>
                        <span className="preview-val total-amount">{formatCurrency(total, form.currency)}</span>
                    </div>
                    {form.currency !== 'EUR' && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Conversion portefeuille : ≈{' '}
                            <strong style={{ color: 'var(--text-primary)' }}>
                                {formatCurrency(total / (parseNumber(form.exchangeRate, exchangeRateFor(form.currency, forexRates, forexRate)) || 1), 'EUR')}
                            </strong>{' '}
                            (taux 1 € = {Number(form.exchangeRate || exchangeRateFor(form.currency, forexRates, forexRate)).toFixed(4)} {form.currency})
                        </div>
                    )}
                </div>

                <div className="btn-row">
                    <button type="button" className="btn-secondary" onClick={handleReset}>
                        {editingTransaction ? 'Annuler la modification' : 'Effacer le formulaire'}
                    </button>
                    <button type="submit" className="btn-primary" disabled={form.type !== 'BUY' && transactionAssets.length === 0}>
                        <CheckCircle2 size={16} />
                        {editingTransaction ? 'Enregistrer les modifications' : 'Confirmer la transaction'}
                    </button>
                </div>
            </form>
        </div>
    )
}
