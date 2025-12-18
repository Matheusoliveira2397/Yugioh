-- Teste de INSERT direto na tabela duels
INSERT INTO duels (
    "player1_id",
    "player2_id",
    status,
    "player1LifePoints",
    "player2LifePoints",
    "currentTurn",
    "currentPhase",
    "duelTime"
) VALUES (
    1,
    2,
    'IN_PROGRESS',
    8000,
    8000,
    1,
    'DRAW',
    0
) RETURNING id, "player1_id", "player2_id", status;









