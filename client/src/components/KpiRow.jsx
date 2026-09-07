import { formatCurrency, formatPercent } from '../lib/portfolio'
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    PiggyBank,
    Layers,
    ArrowUpRight,
    ArrowDownRight,
} from 'lucide-react'

export default function KpiRow({ snapshot }) {
    const { currentValue, invested, totalPnL, totalPnLPct, positions, transactionCount, unrealizedPnL, unrealizedPct } =
        snapshot

    const isTotalPos = totalPnL >= 0
    const isUnrealizedPos = unrealizedPnL >= 0

    return (
        <div className="kpi-grid">
            {/* KPI 1 : Valeur Totale */}
            <div className="kpi-card">
                <div className="kpi-top">
                    <span className="kpi-title">Valeur du portefeuille</span>
                    <div className="kpi-icon-badge blue">
                        <Wallet size={18} />
                    </div>
                </div>
                <div className="kpi-main-val">{formatCurrency(currentValue)}</div>
                <div className="kpi-bottom">
                    <span className={`delta-badge ${isTotalPos ? 'pos' : 'neg'}`}>
                        {isTotalPos ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {formatPercent(totalPnLPct, true)}
                    </span>
                    <span className="kpi-subtext">Rendement global</span>
                </div>
            </div>

            {/* KPI 2 : Montant Total Investi */}
            <div className="kpi-card">
                <div className="kpi-top">
                    <span className="kpi-title">Capital investi (PRU)</span>
                    <div className="kpi-icon-badge purple">
                        <PiggyBank size={18} />
                    </div>
                </div>
                <div className="kpi-main-val">{formatCurrency(invested)}</div>
                <div className="kpi-bottom">
                    <span className="kpi-subtext">
                        Sur <strong>{positions.length}</strong> position{positions.length > 1 ? 's' : ''} active{positions.length > 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* KPI 3 : Plus-value latente */}
            <div className="kpi-card">
                <div className="kpi-top">
                    <span className="kpi-title">Plus-value latente</span>
                    <div className={`kpi-icon-badge ${isUnrealizedPos ? 'green' : 'red'}`}>
                        {isUnrealizedPos ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    </div>
                </div>
                <div className={`kpi-main-val ${isUnrealizedPos ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(unrealizedPnL)}
                </div>
                <div className="kpi-bottom">
                    <span className={`delta-badge ${isUnrealizedPos ? 'pos' : 'neg'}`}>
                        {isUnrealizedPos ? '+' : ''}
                        {formatPercent(unrealizedPct)}
                    </span>
                    <span className="kpi-subtext">Non matérialisée</span>
                </div>
            </div>

            {/* KPI 4 : Plus-value globale & Activité */}
            <div className="kpi-card">
                <div className="kpi-top">
                    <span className="kpi-title">Plus-value totale (Net)</span>
                    <div className={`kpi-icon-badge ${isTotalPos ? 'green' : 'red'}`}>
                        <Layers size={18} />
                    </div>
                </div>
                <div className={`kpi-main-val ${isTotalPos ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(totalPnL)}
                </div>
                <div className="kpi-bottom">
                    <span className="kpi-subtext">
                        <strong>{transactionCount}</strong> opération{transactionCount > 1 ? 's' : ''} enregistrée{transactionCount > 1 ? 's' : ''}
                    </span>
                </div>
            </div>
        </div>
    )
}