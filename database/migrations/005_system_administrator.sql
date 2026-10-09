INSERT INTO permissions(id) VALUES ('system.view'),('user.manage'),('security.view'),('backup.restore'),('system.settings') ON CONFLICT DO NOTHING;
DELETE FROM role_permissions WHERE role_id='Administrator';
INSERT INTO role_permissions(role_id,permission_id) SELECT 'Administrator',id FROM permissions WHERE id IN ('system.view','user.manage','security.view','backup.restore','system.settings');
INSERT INTO application_settings(key,value) VALUES('system','{"displayName":"BCIS","supportContact":""}') ON CONFLICT DO NOTHING;
