import { createClient } from '@supabase/supabase-js';
// ΔΙΟΡΘΩΣΗ (resumable/TUS video uploads - βλ. useEventPhotos.js):
// εξάγουμε τώρα και το URL/anon key (export) ώστε να τα ξαναχρησιμοποιήσει
// το tus-js-client χωρίς να τα ξαναγράφουμε/διπλασιάζουμε αλλού - το anon
// key είναι ήδη δημόσιο/ασφαλές να εκτίθεται στο client (ίδια λογική με
// πριν).
export const supabaseUrl = 'https://jxfaoxcasdqjrbdqeoan.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZmFveGNhc2RxanJiZHFlb2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODUyNjgsImV4cCI6MjEwNDE2MTI2OH0.rcVYeet2n2AsLWRaMI4E2W_0r9NqDlTsT4ehi0M3N9k';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);