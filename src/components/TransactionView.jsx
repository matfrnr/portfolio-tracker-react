import { useMemo, useState } from 'react'
import { formatCurrency } from '../lib/portfolio'

const initialForm = {
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

export default function TransactionView({ onAddTransaction }) {
    const [form, setForm] = useState(initialForm)

    const total = useMemo(() => {
        const quantity = Number(form.quantity || 0)
        const unitPrice = Number(form.unitPrice || 0)
        const fees = Number(form.fees || 0)
        return quantity * unitPrice + fees
    }, [form])

    function updateField(name, value) {
        setForm((current) => ({ ...current, [name]: value }))
    }

    function handleSubmit(event) {
        event.preventDefault()
        onAddTransaction({
            ...form,
            ticker: form.ticker.trim().toUpperCase(),
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
            currentPrice: form.currentPrice === '' ? null : Number(form.currentPrice),
            fees: Number(form.fees || 0),
        })
        setForm(initialForm)
    }

    return (
        <div className="card">
            <div className="card-title">Enregistrer une transaction</div>

            <div className="type-toggle">
                <button
                    type="button"
                    className={form.type === 'BUY' ? 'type-btn active' : 'type-btn'}
                    onClick={() => updateField('type', 'BUY')}
                >
                    Achat
                </button>
                <button
                    type="button"
                    className={form.type === 'SELL' ? 'type-btn active' : 'type-btn'}
                    onClick={() => updateField('type', 'SELL')}
                >
                    Vente
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="form-grid">
                    <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Ticker / Symbole</label>
                        <input
                            value={form.ticker}
                            onChange={(event) => updateField('ticker', event.target.value)}
                            placeholder="ex. AAPL, MC.PA"
                            required
                        />
                    </div>

                    <div className="form-field">
                        <label>Nom (optionnel)</label>
                        <input
                            value={form.name}
                            onChange={(event) => updateField('name', event.target.value)}
                            placeholder="ex. Apple Inc."
                        />
                    </div>

                    <div className="form-field">
                        <label>Date</label>
                        <input
                            type="date"
                            value={form.date}
                            onChange={(event) => updateField('date', event.target.value)}
                            required
                        />
                    </div>

                    <div className="form-field">
                        <label>Quantité</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={form.quantity}
                            onChange={(event) => updateField('quantity', event.target.value)}
                            required
                        />
                    </div>

                    <div className="form-field">
                        <label>{form.type === 'BUY' ? "Prix d'achat unitaire (€)" : 'Prix de vente unitaire (€)'}</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={form.unitPrice}
                            onChange={(event) => updateField('unitPrice', event.target.value)}
                            required
                        />
                    </div>

                    <div className="form-field">
                        <label>Cours actuel (€)</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={form.currentPrice}
                            onChange={(event) => updateField('currentPrice', event.target.value)}
                            placeholder="optionnel"
                        />
                        <span className="hint">Permet de calculer le gain/perte immédiatement</span>
                    </div>

                    <div className="form-field">
                        <label>Frais (€)</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={form.fees}
                            onChange={(event) => updateField('fees', event.target.value)}
                        />
                    </div>

                    <div className="form-field">
                        <label>Note (optionnel)</label>
                        <input
                            value={form.note}
                            onChange={(event) => updateField('note', event.target.value)}
                            placeholder="ex. dividende réinvesti"
                        />
                    </div>
                </div>

                <div className="total-preview">
                    Total : <span>{formatCurrency(total)}</span>
                </div>

                <div className="btn-row">
                    <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setForm(initialForm)}
                    >
                        Effacer
                    </button>
                    <button type="submit" className="btn-primary">
                        Enregistrer
                    </button>
                </div>
            </form>
        </div>
    )
}