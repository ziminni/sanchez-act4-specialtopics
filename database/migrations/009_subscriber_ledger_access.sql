INSERT INTO permissions(id) VALUES ('ledger.view') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,'ledger.view' FROM roles r WHERE r.id='Collection Supervisor' ON CONFLICT DO NOTHING;
