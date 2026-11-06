import { supabase } from '../lib/supabase'

const defaults = {
    currencies: {},
    assetMetadata: {},
    tagCatalog: ['Action', 'ETF', 'PEA', 'CTO'],
}

export async function getPortfolioSettings() {
    if (!supabase) return defaults
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) return defaults
    const { data, error } = await supabase.from('portfolio_settings')
        .select('currencies,asset_metadata,tag_catalog')
        .eq('user_id', user.id)
        .maybeSingle()
    if (error) throw error
    return data ? {
        currencies: data.currencies || {},
        assetMetadata: data.asset_metadata || {},
        tagCatalog: data.tag_catalog || defaults.tagCatalog,
    } : defaults
}

export async function savePortfolioSettings({ currencies = {}, assetMetadata = {}, tagCatalog = defaults.tagCatalog }) {
    if (!supabase) return null
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) return null
    const { error } = await supabase.from('portfolio_settings').upsert({
        user_id: user.id,
        currencies,
        asset_metadata: assetMetadata,
        tag_catalog: tagCatalog,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) throw error
    return true
}
