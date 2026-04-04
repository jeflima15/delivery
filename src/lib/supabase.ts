import { createClient } from '@supabase/supabase-js'

// @ts-ignore - Supabase defines these in Vite env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// @ts-ignore - Supabase defines these in Vite env
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase URL ou Key não encontradas no .env. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.")
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
