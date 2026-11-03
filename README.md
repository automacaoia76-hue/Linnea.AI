# Linnea.AI

Agente de IA que limpa e organiza o PC com Windows. Você conversa com a Linnea (por texto ou por voz), ela analisa o disco, monta um plano de limpeza e só apaga alguma coisa depois que você aprova.

Projeto pessoal, feito por **Thiago Veira da Silva**.

## O que ela faz

- **Analisa o disco**: lixo, temporários, duplicatas, arquivos grandes e do que o disco é feito.
- **Monta um plano em duas fases**: primeiro mostra os passos, depois executa um por um, com a sua aprovação.
- **Controla a própria tela**: abre pastas no mapa, destaca cards, marca arquivos e muda configurações a pedido.
- **Conversa por voz** em tempo real (Gemini Live), usando as mesmas ferramentas do chat escrito.
- **Lembra de você**: guarda preferências e o histórico de limpezas.
- **Modo nuvem**: um "retrato" do PC (sem nomes de arquivos) vai para o Supabase, e dá para perguntar à Linnea pelo celular.

## Como funciona por dentro

| Parte | Tecnologia |
|---|---|
| Agente | LangChain `create_agent` (loop ReAct) + LangGraph, com memória por conversa |
| Modelos | Qwen 3.8 Flash via OpenRouter, com DeepSeek V4 Flash de reserva |
| Voz | Google Gemini Live por WebSocket |
| API | FastAPI com streaming das respostas |
| Tela | React 19 + Vite, robô holográfico em 3D com Three.js |
| Nuvem | Render (API) + Supabase (login e retrato do PC) |
| App de PC | pywebview + PyInstaller (vira um `.exe`) |

Algumas decisões que valem a pena ver no código:

- **Humano no controle**: as ferramentas que apagam arquivos passam pelo `HumanInTheLoopMiddleware`. O agente pausa, a tela mostra um card de aprovação e ele só continua depois do "sim" ([backend/agent.py](backend/agent.py)).
- **Modelo reserva com prazo**: se o modelo principal não começar a responder em 10 s ou der erro 429, o middleware troca para o modelo reserva sem o usuário perceber ([backend/streaming_fallback.py](backend/streaming_fallback.py)).
- **Travas de segurança testadas**: tudo vai para a Lixeira (dá para restaurar), e pastas do sistema são bloqueadas, inclusive truques como `Downloads/../Windows`. Os testes com pytest usam pastas falsas ([backend/tests/test_seguranca.py](backend/tests/test_seguranca.py)).
- **Ferramentas do agente** ficam em [backend/tools/](backend/tools/): scan de disco, saúde do PC, organização do Downloads, busca na web (Tavily), controle da tela etc.

## Estrutura

```
backend/    API FastAPI, agente e ferramentas (Python)
frontend/   Tela em React + Vite
render.yaml Deploy da API no Render
```

## Como rodar

Você vai precisar de Python 3.12, [uv](https://docs.astral.sh/uv/) e Node.js.

1. Crie um arquivo `.env` na raiz com as suas chaves:

   ```
   OPENROUTER_API_KEY=...
   GEMINI_API_KEY=...      # modo voz
   TAVILY_API_KEY=...      # busca na web
   ```

2. Ligue a API:

   ```
   cd backend
   uv sync
   uv run uvicorn api:app --port 8000
   ```

3. Em outro terminal, ligue a tela:

   ```
   cd frontend
   npm install
   npm run dev
   ```

4. Para rodar os testes: `cd backend` e depois `uv run pytest`.
