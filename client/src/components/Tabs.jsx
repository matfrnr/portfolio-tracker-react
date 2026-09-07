import {
    LayoutDashboard,
    Briefcase,
    PlusCircle,
    History,
} from 'lucide-react'

export default function Tabs({ currentTab, onChange, positionsCount = 0, transactionsCount = 0 }) {
    const tabs = [
        { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
        { id: 'positions', label: 'Positions', icon: Briefcase, count: positionsCount },
        { id: 'transaction', label: 'Nouvelle transaction', icon: PlusCircle },
        { id: 'history', label: 'Historique', icon: History, count: transactionsCount },
    ]

    return (
        <div className="nav-tabs" role="tablist" aria-label="Navigation du portefeuille">
            {tabs.map(({ id, label, icon: Icon, count }) => {
                const isActive = currentTab === id
                return (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`nav-tab-btn ${isActive ? 'active' : ''}`}
                        onClick={() => onChange(id)}
                    >
                        <Icon size={16} />
                        <span>{label}</span>
                        {typeof count === 'number' && count > 0 && (
                            <span className="tab-badge">{count}</span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}