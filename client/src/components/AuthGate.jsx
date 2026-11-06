import { useEffect, useState } from 'react'
import { ShieldCheck, LogIn, AlertCircle } from 'lucide-react'
import App from '../App'
import { supabase, supabaseConfigured } from '../lib/supabase'

export default function AuthGate() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(supabaseConfigured)
    const [signingIn, setSigningIn] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!supabase) return undefined
        let active = true
        supabase.auth.getSession().then(({ data, error: sessionError }) => {
            if (!active) return
            if (sessionError) setError(sessionError.message)
            setSession(data?.session || null)
            setLoading(false)
        })
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession)
            setLoading(false)
        })
        return () => {
            active = false
            subscription.unsubscribe()
        }
    }, [])

    async function signInWithGoogle() {
        setSigningIn(true)
        setError('')
        const { error: signInError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        })
        if (signInError) {
            setError(signInError.message)
            setSigningIn(false)
        }
    }

    if (!supabaseConfigured) {
        if (import.meta.env.DEV) return <App user={null} />
        return (
            <div className="auth-page">
                <section className="auth-card">
                    <ShieldCheck size={30} className="auth-icon" />
                    <h1>Configuration Supabase requise</h1>
                    <p>Renseigne l’URL et la clé publique de ton projet dans les variables d’environnement Vercel avant de publier l’application.</p>
                </section>
            </div>
        )
    }

    if (loading) {
        return <div className="auth-page"><div className="auth-card">Vérification de la session…</div></div>
    }

    if (!session?.user) {
        return (
            <div className="auth-page">
                <section className="auth-card">
                    <ShieldCheck size={32} className="auth-icon" />
                    <h1>Mon portefeuille</h1>
                    <p>Connecte-toi avec Google pour accéder à tes données. Chaque compte dispose de son propre portefeuille.</p>
                    {error && <div className="auth-error"><AlertCircle size={16} />{error}</div>}
                    <button type="button" className="btn-primary auth-google-button" onClick={signInWithGoogle} disabled={signingIn}>
                        <LogIn size={17} />{signingIn ? 'Redirection vers Google…' : 'Continuer avec Google'}
                    </button>
                </section>
            </div>
        )
    }

    return <App key={session.user.id} user={session.user} onSignOut={() => supabase.auth.signOut()} />
}
