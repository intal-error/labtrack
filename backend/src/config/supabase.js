const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("FATAL: Missing Supabase credentials in environment variables.");
  console.error(`SUPABASE_URL: ${supabaseUrl ? "OK" : "MISSING"}`);
  console.error(`SUPABASE_SERVICE_KEY: ${supabaseKey ? "OK" : "MISSING"}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

module.exports = { supabase };
