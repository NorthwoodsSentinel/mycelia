-- 0016: requester-scoped client reference for idempotent request creation (NOR-129, design v4 §A1).
--
-- A caller may set client_ref on POST /v1/requests. The pair (requester_id, client_ref) is unique, so a retry
-- after a lost response cannot create a second request: the server answers 409 DUPLICATE_CLIENT_REF with the
-- existing request instead. Requests without a client_ref are unaffected (partial index, NULLs excluded).

ALTER TABLE requests ADD COLUMN client_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_requester_client_ref
  ON requests(requester_id, client_ref)
  WHERE client_ref IS NOT NULL;
