# Ideias para o futuro

## Memória de longo prazo da Linnea no Obsidian

> ✅ **Feito em 04/10/2026.** Pasta: `E:\LANG CLEAN\memoria\Linnea` (fora do git). A Linnea anota sozinha (`lembrar`),
> procura nas conversas antigas (`buscar_memoria`) e o app grava uma linha por pergunta no arquivo do dia, sem gastar IA.
> As decisões abaixo ficaram: pasta nova no projeto e anotar sozinha o que for importante.

**Problema hoje:** a memória (`InMemorySaver`) só dura enquanto a API está ligada, e cada recarga da página começa uma conversa nova. A Linnea esquece tudo.

**Ideia:** guardar a memória em arquivos `.md` numa pasta que pode ser aberta no Obsidian (o Obsidian é só uma pasta de arquivos de texto; não precisa de plugin). Assim dá para ler e corrigir as memórias dela.

```
SeuCofre/Linnea/
├── Perfil.md            ← fatos sobre o usuário (curto, carregado em toda mensagem)
└── Conversas/
    ├── 2026-10-02.md    ← resumo do que conversaram no dia
    └── ...
```

**Como funcionaria**
- `Perfil.md`: 10 a 20 linhas (nome, situação do PC, preferências). Vai junto com o prompt em toda mensagem.
- Ferramenta `lembrar(fato)`: a Linnea anota no perfil quando o usuário conta algo importante.
- Ferramenta `buscar_memoria(assunto)`: procura nos resumos antigos só quando precisar (ex.: "o que falamos semana passada?").
- Ao fim de cada conversa, grava um resumo curto em `Conversas/AAAA-MM-DD.md`.

**Por que gasta pouco token:** só o perfil curto (~300 tokens, ~US$ 0,00005 por mensagem) vai sempre. As conversas antigas nunca são reenviadas inteiras, só trechos quando ela busca.

**Decidir antes de fazer**
1. Usar um cofre do Obsidian que já existe (qual pasta?) ou criar uma pasta `memoria` no projeto.
2. A Linnea anota sozinha o que achar importante, ou só quando o usuário pedir ("Linnea, lembra disso").

## Telas da barra lateral

Cada ícone da barra lateral abre uma tela própria. A tela 🏠 Início continua sendo a atual (chat, cards e robô).

### 📁 Arquivos (explorador inteligente)
- [x] Mapa do disco clicável: quadradinhos do tamanho de cada pasta; clicar entra na pasta.
- [x] Abas com filtros prontos: Grandes, Duplicados, Antigos (+1 ano sem abrir), Downloads.
- [x] Marcar arquivos e "Mandar para a Lixeira".
- [x] "Perguntar à Linnea" o que é o arquivo.
- [x] Visualizar antes de apagar: prévia de foto, PDF ou vídeo ao lado.
- [x] Busca em linguagem natural ("vídeos do ano passado maiores que 1 GB").
- [x] Arrastar um arquivo até o robô, que "come" o arquivo com uma animação (vai para a Lixeira).
- [x] Etiquetas da Linnea em cada arquivo (por regras, sem IA): "seguro apagar", "pode ser importante", "instalador antigo".

### 📊 Gráficos (histórico e evolução)
- [x] Linha do espaço livre ao longo dos dias (guardar 1 scan por dia).
- [x] Pizza (rosca) do que ocupa o disco: vídeos, jogos, documentos, lixo…
- [x] Contador "Já liberei X GB" e lista das últimas limpezas da Linnea.
- [x] Previsão: "No ritmo atual, seu disco enche em 47 dias".
- [x] Ranking das pastas que mais cresceram na semana.
- [x] Calendário de limpezas (quadradinhos coloridos, estilo GitHub).
- [x] Relatório mensal escrito pela Linnea, com opção de baixar em PDF.

### ⚙️ Configurações
- [x] Tema claro/escuro (o botão da barra lateral continua).
- [x] Pastas que a Linnea pode analisar e pastas proibidas.
- [x] Limpeza automática semanal (liga/desliga).
- [x] Voz da Linnea: modo conversa com o Gemini Live (04/10/2026). Botão 🎤 no chat, legenda, interrupção, as mesmas ferramentas do chat escrito (com o cartão de permissão), 8 vozes nas Configurações e tour falado (ela lê cada balão e passa sozinha).
- [x] Tamanho mínimo de "arquivo grande" (hoje 100 MB).
- [x] Personalidade da Linnea: formal, divertida ou direta.
- [x] Cor da aura do robô.
- [x] Nível de cuidado: "Sempre pedir permissão" ou "Pode limpar o lixo sozinha".
- [x] Lista de "nunca apagar" (pastas ou arquivos protegidos).

### Bônus: a Linnea controlando o app
- [x] Trocar de tela ("me mostra o histórico" abre Gráficos).
- [x] Mudar configurações por conversa ("deixa o tema escuro", "desliga sua voz").
- [x] Tour guiado ("me explica o app"): passa pelas telas destacando cada parte.
- [x] Navegar nas pastas ("abre a pasta Downloads" entra no mapa de arquivos).
- [x] Selecionar para você ("marca todos os vídeos antigos") e você só aprova.
- [x] Robô vira e aponta para o card ou a tela de que ela está falando.
- [x] Trocar o tema por conversa ("deixa escuro") e abrir a tela de Gráficos ("me mostra o histórico").

### App "vivo": a Linnea mexendo na tela
- [x] Cursor da Linnea: um cursor brilhante sai do chat, voa até o card/ícone/pasta e "clica" antes de cada ação.
- [x] Ela digita na trilha do mapa, letra por letra, antes de abrir uma pasta.
- [x] Rastro de "scan" nos cards: uma luz passa por cima de cada card enquanto ela analisa.
- [x] Números contando nos cards quando o scan termina (0 → 214 GB).
- [x] Arquivo voando para a Lixeira: o quadradinho do mapa encolhe e voa até um ícone de lixeira.
- [x] Barra de status da Linnea no topo: "Linnea está olhando Downloads…", "marcando 3 arquivos…".
- [x] A aura do robô pulsa no ritmo das palavras enquanto ela escreve.
- [x] Robô com expressões: pisca mais rápido quando acha muito lixo, comemora quando libera espaço.
- [x] Notificação dela no canto depois de um scan ("Achei 2 GB de lixo novo 👀").
- [x] Sugestões do chat que mudam conforme a tela (mapa: "O que é essa pasta?"; Gráficos: "Por que meu disco encheu?").

## Outras ideias sugeridas na conversa

### Já feitas
- [x] Painel "Raciocínio da Linnea" mostrando o loop ReAct ao vivo.
- [x] Respostas em streaming (texto aparecendo enquanto ela escreve) e modelo reserva quando o Qwen lota.
- [x] Linnea controlando a tela: destacar card, rodar scan, robô acelerando enquanto trabalha.
- [x] Pedido de permissão (Aprovar / Recusar) antes de mexer em arquivos.
- [x] Mover para a Lixeira (arquivos e pastas inteiras) e limpar temporários + esvaziar a Lixeira.
- [x] Apagar duplicatas mantendo 1 cópia.
- [x] Organizar a pasta Downloads em subpastas, com "desfazer".
- [x] Botão "Iniciar Linnea" na Área de Trabalho, que liga tudo.
- [x] Histórico de scans (1 por dia) e contador "quanto já liberei".
- [x] Robô reagindo ao resultado (comemora quando libera espaço, fica "preocupado" com muito lixo).
- [x] Linnea explicando um arquivo ("Perguntar à Linnea").
- [x] Arquivos esquecidos (+1 ano sem mudar) → aba "Antigos".
- [x] Sugestões clicáveis no chat.

### Ainda não feitas
**Tela e visual**
- [x] Botão "Executar plano do agente" com um resumo do que a Linnea faria (estava no mock aprovado).
- [x] Card "Saúde do PC" com uma nota (ex.: 72/100 · Atenção).
- [x] Interface que cresce junto com a tela (em 1920×1080 sobra espaço vazio).
- [x] Brilho em volta do robô acompanhando a cor da aura escolhida.
- [x] Antes e depois da limpeza (card "Disco: 92% → 78%" com animação).

**Tela do fone do robô**
- [x] Clicar no fone do robô dá zoom e abre uma tela de saúde do PC.
- [x] Botão para voltar dessa tela para a inicial.
- [x] CPU, GPU, RAM e temperatura de verdade, lidos pelo Python (sem biblioteca nova; a temperatura da CPU o Windows não informa).

**Mais funções de limpeza**
- [x] Fotos parecidas (tiradas em sequência, prints repetidos), além das cópias idênticas.
- [x] Pastas vazias e atalhos quebrados.
- [x] Programas pesados agora (RAM e CPU), com a Linnea explicando cada um.
- [x] Renomear arquivos em lote.
- [x] Compactar arquivos antigos em .zip.
- [x] Limpar o cache do navegador.
- [x] Desativar programas que abrem com o Windows.
- [x] Desinstalar programas (com aviso forte).
- [x] Notificação do Windows quando o disco passar de 90% cheio.
- [x] Etiquetas dos arquivos revisadas pela IA (hoje são por regras).

**Para o curso / qualidade**
- [ ] Resumir o histórico de conversas longas (middleware do LangChain) para gastar menos tokens.
- [x] Testes automáticos (pytest) das travas de segurança (nunca apagar a pasta Downloads, nunca apagar a última cópia). Rodar com `uv run pytest` na pasta backend.
- [ ] Rastrear o agente no LangSmith (passos, tempo e custo de cada pergunta).
- [ ] Encurtar a pausa do Qwen ou pulá-lo nos horários em que vive lotado.
- [x] Mensagem amigável no chat do terminal (`chat.py`) quando a IA está lotada (erro 429).
- [ ] Anotar os termos novos no caderno de estudos (retargeting, SSE, middleware, Human-in-the-loop…).

**Faxina e apresentação**
- [ ] Apagar os modelos de robô antigos sem uso em `frontend/public/` (conferir antes quais ainda são usados).
- [x] Abrir como app (04/10/2026): a API entrega a tela compilada e liga escondida com o Windows.
- [x] Programa de verdade: `Linnea.AI.exe` (pywebview + PyInstaller, ~80 MB) com janela própria; gerar de novo com `uv run python build_exe.py` na pasta backend.
- [x] Acessar de qualquer lugar: Linnea na nuvem em https://linnea-ai.onrender.com (Render grátis + Supabase), com login e o último retrato do PC (enviado a cada 10 min). Publicar mudanças: `uv run python preparar_nuvem.py` + git push.
- [x] Layout de celular e modo leve (05/10/2026): uma coluna com abas embaixo, sem robô 3D; modo voz com a logo animada e o chat no canto; logo nova em todo lugar.
- [ ] Conexão ao vivo: pedir ações pelo celular com o PC ligado (com aprovação).

## Linnea especialista em PC

- [x] Parte 1: regras de especialista (diagnosticar o gargalo, upgrades por custo-benefício conferindo compatibilidade, explicar simples, nunca inventar).
- [ ] Parte 2: ela conhecer mais do PC (slots de RAM livres e máximo da placa, versão da BIOS, monitor; a fonte ela pergunta e guarda na memória).
- [x] Parte 3: `pesquisar_web` com Tavily, só em sites confiáveis (lista fixa em `backend/tools/web_search.py`), citando as fontes. Funciona no chat e na voz.
