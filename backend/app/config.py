import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

# Service-role client for backend operations (bypasses RLS)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Anon client for auth operations
supabase_anon: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY) if SUPABASE_ANON_KEY else None


def get_supabase() -> Client:
    return supabase


def get_supabase_anon() -> Client:
    return supabase_anon
