import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { criarHandler } from './handler.mjs';

Deno.serve(criarHandler({
  createClient,
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));
