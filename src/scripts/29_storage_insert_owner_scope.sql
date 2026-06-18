-- 29: Scope storage uploads to a class the caller actually owns.
--
-- The original policy (09) allowed ANY authenticated user to upload to ANY
-- path in the `files` bucket:
--     WITH CHECK (bucket_id = 'files')
-- i.e. no ownership binding at all. Upload paths are
--     <class_id>/<timestamp>-<filename>
-- (see ClassDetails.uploadSingleFile), so the first folder segment is the
-- class id. Require that class to belong to the uploader.
--
-- READ (23) and UPDATE/DELETE (09) are already owner-scoped via public.files;
-- this closes the remaining INSERT gap. Idempotent — safe to re-run.
--
-- ⚠️  RUN IN PROD then TEST AN UPLOAD before relying on it: if your live
--     upload path convention differs from `<class_id>/...`, adjust the
--     foldername index below. classes.id is compared as text so it works
--     whether the column is uuid or bigint.

DROP POLICY IF EXISTS "Allow authenticated users to upload files" ON storage.objects;
-- Also drop the earlier (buggy) version of this policy: an unqualified `name`
-- inside the subquery bound to classes.name instead of the object path, which
-- blocked every upload. The form below evaluates foldername(name) in the OUTER
-- scope (name = storage.objects.name, unambiguous) and matches it against the
-- caller's owned class ids via IN - no column shadowing.
DROP POLICY IF EXISTS "Users upload into their own class folders" ON storage.objects;

CREATE POLICY "Users upload into their own class folders"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'files'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text FROM public.classes c WHERE c.user_id = auth.uid()
  )
);
