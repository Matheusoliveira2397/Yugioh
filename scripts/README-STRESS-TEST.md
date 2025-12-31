# 🚀 Script de Teste de Stress

Este script simula múltiplos usuários e duelos para testar a capacidade do servidor.

## 📋 Pré-requisitos

1. Instalar dependências:
```bash
cd scripts
npm install axios
```

Ou instalar globalmente:
```bash
npm install -g axios
```

## 🎯 Como Usar

### Execução Básica
```bash
node stress-test.js
```

### Com Variáveis de Ambiente

```bash
# Teste pequeno (10 usuários, 20 duelos)
NUM_USERS=10 NUM_DUELS=20 node stress-test.js

# Teste médio (50 usuários, 100 duelos)
NUM_USERS=50 NUM_DUELS=100 node stress-test.js

# Teste grande (100 usuários, 200 duelos)
NUM_USERS=100 NUM_DUELS=200 node stress-test.js

# Teste de stress extremo (200 usuários, 500 duelos, 20 requisições simultâneas)
NUM_USERS=200 NUM_DUELS=500 CONCURRENT=20 node stress-test.js
```

### Windows PowerShell
```powershell
$env:NUM_USERS=50
$env:NUM_DUELS=100
node stress-test.js
```

### Windows CMD
```cmd
set NUM_USERS=50
set NUM_DUELS=100
node stress-test.js
```

## ⚙️ Variáveis de Ambiente

- `API_URL` - URL da API (padrão: `http://localhost:3000`)
- `NUM_USERS` - Número de usuários a criar (padrão: `50`)
- `NUM_DUELS` - Número de duelos a simular (padrão: `100`)
- `CONCURRENT` - Requisições simultâneas (padrão: `10`)
- `DELAY` - Delay entre requisições em ms (padrão: `50`)

## 📊 O que o Script Faz

1. **Cria Usuários**: Registra múltiplos usuários via API
2. **Faz Login**: Autentica todos os usuários criados
3. **Equipa Decks**: Tenta equipar decks para cada usuário
4. **Cria Duelos**: Simula criação de duelos via API HTTP

## 📈 Relatório

O script gera um relatório completo com:
- Estatísticas de sucesso/falha
- Tempo total de execução
- Taxa de operações por segundo
- Lista de erros encontrados

## ⚠️ Avisos

- Este script cria dados reais no banco de dados
- Use apenas em ambiente de teste/desenvolvimento
- O servidor pode ficar sobrecarregado com muitos usuários simultâneos
- Ajuste `CONCURRENT` e `DELAY` conforme a capacidade do servidor

