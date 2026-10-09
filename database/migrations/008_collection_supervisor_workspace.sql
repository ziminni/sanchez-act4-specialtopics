INSERT INTO permissions(id) VALUES ('collection.view'),('collection.manage'),('collection.reconcile') ON CONFLICT DO NOTHING;
DELETE FROM role_permissions WHERE role_id='Collection Supervisor';
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.id='Collection Supervisor' AND p.id IN ('collection.view','collection.manage','collection.reconcile');
