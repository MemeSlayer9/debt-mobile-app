import { createClient } from "@supabase/supabase-js";
import AsyncStorage from '@react-native-async-storage/async-storage'

// Replace with your Supabase project URL and Anon Key
const SUPABASE_URL = "https://ebgjsahovwaurtxvnnpf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2pzYWhvdndhdXJ0eHZubnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA1ODM0MTksImV4cCI6MjA1NjE1OTQxOX0.4Hse9sG_6f-Do2_Mjd0pa82C0QiErBGj2KDU-_QU8-Y";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})