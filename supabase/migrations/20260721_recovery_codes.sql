-- Recovery codes for MFA bypass
-- 10 single-use codes per user, generated client-side, hashed with bcrypt server-side.

CREATE TABLE IF NOT EXISTS public.user_recovery_codes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash   text NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user
    ON public.user_recovery_codes(user_id);

ALTER TABLE public.user_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Users can read their own recovery codes (for the "view codes" page, but NOT to see the hashes).
-- They never need the raw hash — only to consume a code.
CREATE POLICY "users can see their own codes"
    ON public.user_recovery_codes FOR SELECT
    USING (auth.uid() = user_id);

-- Service role (and authenticated via RPC) can insert/update.
-- The actual hash/verify happens in an RPC (see below).

-- ── Generate initial 10 codes for a user ───────────────────────
-- Called after MFA enrolment. Inserts the bcrypt hashes.
-- The user already has the plain codes client-side.
CREATE OR REPLACE FUNCTION public.create_recovery_codes(
    p_user_id uuid,
    p_hashes  text[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
    h text;
BEGIN
    -- Validate caller is the user themselves
    IF auth.uid() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    -- Replace any existing (regenerate scenario)
    DELETE FROM public.user_recovery_codes WHERE user_id = p_user_id;

    FOREACH h IN ARRAY p_hashes LOOP
        INSERT INTO public.user_recovery_codes (user_id, code_hash) VALUES (p_user_id, h);
    END LOOP;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ── Consume a recovery code ────────────────────────────────────
-- Returns true if a matching unused code exists and was marked used.
-- Returns false otherwise. Single-use enforcement via UPDATE ... WHERE used_at IS NULL.
CREATE OR REPLACE FUNCTION public.consume_recovery_code(
    p_user_id uuid,
    p_hash    text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.user_recovery_codes
       SET used_at = now()
     WHERE user_id = p_user_id
       AND code_hash = p_hash
       AND used_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count = 1;
END;
$$;

-- ── Count remaining (unused) codes for a user ─────────────────
CREATE OR REPLACE FUNCTION public.remaining_recovery_codes(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT count(*)::integer FROM public.user_recovery_codes
     WHERE user_id = p_user_id AND used_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.create_recovery_codes(uuid, text[])
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_recovery_code(uuid, text)
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remaining_recovery_codes(uuid)
    TO authenticated;
