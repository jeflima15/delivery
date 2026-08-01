-- Execute no projeto Supabase somente depois de integrar os JWTs de upload do backend.
-- Novos objetos devem seguir tenants/<tenant_id>/<uuid>.<ext>.

create policy "tenant public read"
on storage.objects for select
using (
  bucket_id in ('produtos', 'loja')
  and (storage.foldername(name))[1] = 'tenants'
);

-- Escrita anonima permanece deliberadamente bloqueada. O backend deve emitir token
-- autenticado com tenant_id e role antes de habilitar a policy abaixo.
-- create policy "tenant admin insert" on storage.objects for insert
-- with check (
--   bucket_id in ('produtos', 'loja')
--   and (storage.foldername(name))[1] = 'tenants'
--   and (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
--   and (auth.jwt() ->> 'role') in ('tenant_owner', 'tenant_admin', 'tenant_manager')
-- );
