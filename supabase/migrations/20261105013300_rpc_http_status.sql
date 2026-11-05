-- PostgREST reports unknown error codes as HTTP 500, so an expired invite looked like a server crash.
-- PT404 makes PostgREST answer with a real 404.


create or replace function public.accept_share(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.shares
     set viewer_id = auth.uid(), status = 'active', accepted_at = now(),
         invite_token_hash = null, invite_expires_at = null
   where invite_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'pending'
     and invite_expires_at > now()
     and owner_id <> auth.uid()
  returning id into v_id;
  if v_id is null then
    raise exception 'invalid or expired invite' using errcode = 'PT404';
  end if;
  return v_id;
end $$;

create or replace function public.update_share_scope(p_share_id uuid, p_scope public.share_scope)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shares set scope = p_scope
   where id = p_share_id and owner_id = auth.uid() and status in ('pending', 'active');
  if not found then
    raise exception 'share not found' using errcode = 'PT404';
  end if;
end $$;

create or replace function public.revoke_share(p_share_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shares
     set status = 'revoked', revoked_at = now(),
         invite_token_hash = null, invite_expires_at = null
   where id = p_share_id
     and (owner_id = auth.uid() or viewer_id = auth.uid())
     and status <> 'revoked';
  if not found then
    raise exception 'share not found' using errcode = 'PT404';
  end if;
end $$;
