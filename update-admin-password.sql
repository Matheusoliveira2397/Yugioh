-- Atualizar senha do admin para admin123
UPDATE users 
SET password = '$2a$10$/io8nrb/rxITkoYfvhWAbey.VRdm3XNjRTnAnWeSFwFAI4ujBu5C6' 
WHERE username = 'admin';

-- Verificar
SELECT username, substring(password, 1, 30) as password_check 
FROM users 
WHERE username = 'admin';
