import { formatCurrency, formatPercent } from '../lib/portfolio'
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function KpiRow({ snapshot }) {
    const { currentValue, invested, totalPnL, totalPnLPct, positions, transactionCount, unrealizedPnL, unrealizedPct } = snapshot
    const isTotalPos = totalPnL >= 0
    const isUnrealizedPos = unrealizedPnL >= 0
    return (
        <div className="kpi-grid">
            <div className="kpi-card"><div className="kpi-top"><span className="kpi-title">Valeur totale du portefeuille</span><div className="kpi-icon-badge blue"><Wallet size={18} /></div></div><div className="kpi-main-val">{formatCurrency(currentValue, 'EUR')}</div><div className="kpi-bottom"><span className={`delta-badge ${isTotalPos ? 'pos' : 'neg'}`}>{isTotalPos ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{formatPercent(totalPnLPct, true)}</span><span className="kpi-subtext">Convertie en EUR</span></div></div>
            <div className="kpi-card"><div className="kpi-top"><span className="kpi-title">Capital investi</span><div className="kpi-icon-badge purple"><PiggyBank size={18} /></div></div><div className="kpi-main-val">{formatCurrency(invested, 'EUR')}</div><div className="kpi-bottom"><span className="kpi-subtext">Sur <strong>{positions.length}</strong> position{positions.length > 1 ? 's' : ''}</span></div></div>
            <div className="kpi-card"><div className="kpi-top"><span className="kpi-title">Plus-value latente</span><div className={`kpi-icon-badge ${isUnrealizedPos ? 'green' : 'red'}`}>{isUnrealizedPos ? <TrendingUp size={18} /> : <TrendingDown size={18} />}</div></div><div className={`kpi-main-val ${isUnrealizedPos ? 'text-success' : 'text-danger'}`}>{formatCurrency(unrealizedPnL, 'EUR')}</div><div className="kpi-bottom"><span className={`delta-badge ${isUnrealizedPos ? 'pos' : 'neg'}`}>{formatPercent(unrealizedPct, true)}</span><span className="kpi-subtext">Convertie en EUR</span></div></div>
            <div className="kpi-card"><div className="kpi-top"><span className="kpi-title">Performance cumulée nette</span><div className={`kpi-icon-badge ${isTotalPos ? 'green' : 'red'}`}><Layers size={18} /></div></div><div className={`kpi-main-val ${isTotalPos ? 'text-success' : 'text-danger'}`}>{formatCurrency(totalPnL, 'EUR')}</div><div className="kpi-bottom"><span className="kpi-subtext"><strong>{transactionCount}</strong> opération{transactionCount > 1 ? 's' : ''} enregistrée{transactionCount > 1 ? 's' : ''}</span></div></div>
        </div>
    )
}
