import { useEffect, useState } from 'react'
import { ShieldCheck, LogIn, AlertCircle, UserPlus } from 'lucide-react'
import App from '../App'
import { supabase, supabaseConfigured } from '../lib/supabase'

export default function AuthGate() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(supabaseConfigured)
    const [signingIn, setSigningIn] = useState(false)
    const [error, setError] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSignUp, setIsSignUp] = useState(false)

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

    async function submitCredentials(event) {
        event.preventDefault()
        setSigningIn(true)
        setError('')
        try {
            if (isSignUp) {
                const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
                if (signUpError) throw signUpError
                if (!data.session) setError('Compte créé. Vérifie tes e-mails pour confirmer ton adresse avant de te connecter.')
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
                if (signInError) throw signInError
            }
        } catch (authError) {
            setError(authError.message || 'Impossible de se connecter.')
        } finally {
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
                    <p>Connecte-toi ou crée un compte. Chaque compte dispose de son propre portefeuille.</p>
                    {error && <div className="auth-error"><AlertCircle size={16} />{error}</div>}
                    <form className="auth-form" onSubmit={submitCredentials}>
                        <label htmlFor="auth-email">Adresse e-mail</label>
                        <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                        <label htmlFor="auth-password">Mot de passe</label>
                        <input id="auth-password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} />
                        <button type="submit" className="btn-primary auth-google-button" disabled={signingIn}>
                            {isSignUp ? <UserPlus size={17} /> : <LogIn size={17} />}
                            {signingIn ? 'Patiente…' : isSignUp ? 'Créer mon compte' : 'Se connecter'}
                        </button>
                    </form>
                    <button type="button" className="auth-mode-toggle" onClick={() => { setIsSignUp((value) => !value); setError('') }}>
                        {isSignUp ? 'J’ai déjà un compte' : 'Créer un compte'}
                    </button>
                </section>
            </div>
        )
    }

    return <App key={session.user.id} user={session.user} onSignOut={() => supabase.auth.signOut()} />
}
