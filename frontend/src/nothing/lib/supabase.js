import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://whicrziqzctktnzuoqnk.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key-here'

export const supabase = createClient(supabaseUrl, supabaseKey)
