import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://jxfaoxcasdqjrbdqeoan.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZmFveGNhc2RxanJiZHFlb2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODUyNjgsImV4cCI6MjEwNDE2MTI2OH0.rcVYeet2n2AsLWRaMI4E2W_0r9NqDlTsT4ehi0M3N9k';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);