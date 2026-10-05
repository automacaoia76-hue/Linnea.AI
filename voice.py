"""Modo conversa por voz (Gemini Live): o navegador manda o áudio do microfone por um WebSocket,
este arquivo repassa ao Gemini e devolve a fala da Linnea na hora, como no ChatGPT e no Claude.
Por voz ela usa as mesmas ferramentas do chat escrito (e pede permissão do mesmo jeito).

Mensagens para o navegador:
- binárias: pedaços da fala da Linnea (PCM 16 bits, mono, 24 kHz)
- texto (JSON): {"tipo": "voce" | "linnea", "texto": ...} = legenda do que cada um falou;
  {"tipo": "interrompido"} = você falou por cima, pare de tocar; {"tipo": "fim_da_fala"};
  {"tipo": "ui", "acao": {...}} = ação na tela; {"tipo": "aprovacao", "acoes": [...]} = cartão de permissão;
  {"tipo": "erro", "texto": ...}
Do navegador: áudio (binário), {"tipo": "decisao", "aprovar": true/false} (resposta ao cartão) e
{"tipo": "falar", "texto": ...} (o tour pede para ela ler o texto do balão).
"""

import asyncio
import json
import os

from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from agent import build_system_prompt
from tools import ALL_TOOLS, NEEDS_APPROVAL
from tools.file_tools import voice_ui
from tools.settings import load_settings

VOICE_MODEL = "gemini-3.8-live"
VOICE_RULES = """
- AGORA VOCÊ ESTÁ CONVERSANDO POR VOZ: fale de um jeito natural e curto (1 a 3 frases), como numa conversa.
  Nada de listas, títulos ou markdown; arredonde os números ("quase 2 giga" em vez de "1,96 GB").
  Antes de uma ação demorada (como rodar_scan), avise em poucas palavras que vai fazer.
- Tour: se chamar iniciar_tour, diga só "Vamos lá!" (o app manda o texto de cada parada).
  Quando chegar uma mensagem começando com "(Tour do app)", leia em voz alta EXATAMENTE o texto que vem depois,
  sem acrescentar, tirar ou comentar nada.
"""
# O cartão do plano é do chat escrito; por voz ela faz os passos conversando
VOICE_TOOLS = {tool.name: tool for tool in ALL_TOOLS if tool.name != "mostrar_plano"}


def _declarations() -> list[types.FunctionDeclaration]:
    """As ferramentas do LangChain no formato do Gemini (nome, descrição e parâmetros)."""
    return [
        types.FunctionDeclaration(
            name=tool.name,
            description=tool.description,
            parameters_json_schema=tool.tool_call_schema.model_json_schema(),
        )
        for tool in VOICE_TOOLS.values()
    ]


def _config() -> types.LiveConnectConfig:
    voice = load_settings()["voz"]  # escolhida nas Configurações
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)),
            language_code="pt-BR",
        ),
        system_instruction=build_system_prompt() + VOICE_RULES,  # as mesmas regras do chat + o jeito de falar
        tools=[types.Tool(function_declarations=_declarations())],
        input_audio_transcription=types.AudioTranscriptionConfig(),  # legenda do que você falou
        output_audio_transcription=types.AudioTranscriptionConfig(),  # legenda do que ela falou
    )


async def voice_session(ws: WebSocket, auto_approved):
    """auto_approved(pedidos): True se o nível de cuidado deixa a ação passar sem o cartão (vem do api.py)."""
    await ws.accept()
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    decisions = asyncio.Queue()  # respostas do cartão de permissão (True = aprovou)
    try:
        async with client.aio.live.connect(model=VOICE_MODEL, config=_config()) as session:

            async def from_browser():
                """Microfone -> Gemini (PCM 16 bits, mono, 16 kHz) e respostas do cartão de permissão."""
                while True:
                    message = await ws.receive()
                    if message["type"] == "websocket.disconnect":
                        return
                    if message.get("bytes"):
                        await session.send_realtime_input(
                            audio=types.Blob(data=message["bytes"], mime_type="audio/pcm;rate=16000")
                        )
                    elif message.get("text"):
                        data = json.loads(message["text"])
                        if data.get("tipo") == "decisao":
                            await decisions.put(bool(data.get("aprovar")))
                        elif data.get("tipo") == "falar":
                            await session.send_realtime_input(text=f"(Tour do app) {data.get('texto', '')}")

            async def run_tool(call) -> types.FunctionResponse:
                """Roda uma ferramenta que ela pediu (com o cartão de permissão, se for uma que mexe em arquivos)."""
                args = dict(call.args or {})
                tool = VOICE_TOOLS.get(call.name)
                if tool is None:
                    return types.FunctionResponse(id=call.id, name=call.name, response={"error": "ferramenta não existe"})
                if call.name in NEEDS_APPROVAL and not auto_approved([{"name": call.name}]):
                    await ws.send_json({"tipo": "aprovacao", "acoes": [{"nome": call.name, "args": args}]})
                    if not await decisions.get():
                        return types.FunctionResponse(
                            id=call.id, name=call.name, response={"result": "O usuário recusou esta ação."}
                        )
                actions = []  # o que a ferramenta quis mostrar na tela (destacar card, abrir pasta...)
                token = voice_ui.set(actions.append)
                try:
                    result = await asyncio.to_thread(tool.invoke, args)  # em outra thread: o áudio não trava
                except Exception as error:  # noqa: BLE001 — o erro vira resposta e ela explica
                    result = f"Erro: {error}"
                finally:
                    voice_ui.reset(token)
                for action in actions:
                    await ws.send_json({"tipo": "ui", "acao": action})
                return types.FunctionResponse(id=call.id, name=call.name, response={"result": str(result)})

            async def from_gemini():
                """Gemini -> alto-falante, legendas e ferramentas."""
                while True:  # cada receive() termina no fim de uma fala; o while espera a próxima
                    async for message in session.receive():
                        if message.tool_call:
                            responses = [await run_tool(call) for call in message.tool_call.function_calls]
                            await session.send_tool_response(function_responses=responses)
                        content = message.server_content
                        if not content:
                            continue
                        if content.model_turn:
                            for part in content.model_turn.parts:
                                if part.inline_data:
                                    await ws.send_bytes(part.inline_data.data)
                        if content.input_transcription and content.input_transcription.text:
                            await ws.send_json({"tipo": "voce", "texto": content.input_transcription.text})
                        if content.output_transcription and content.output_transcription.text:
                            await ws.send_json({"tipo": "linnea", "texto": content.output_transcription.text})
                        if content.interrupted:
                            await ws.send_json({"tipo": "interrompido"})
                        if content.turn_complete:
                            await ws.send_json({"tipo": "fim_da_fala"})

            # Os dois sentidos rodam ao mesmo tempo; quando um termina (ex.: você fechou a conversa), o outro para
            tasks = [asyncio.create_task(from_browser()), asyncio.create_task(from_gemini())]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                task.result()  # se terminou por erro, o erro aparece aqui
    except WebSocketDisconnect:
        pass  # você encerrou a conversa
    except Exception:  # noqa: BLE001 — IA lotada, sem internet...: avisa na tela em vez de cair calado
        try:
            await ws.send_json({"tipo": "erro", "texto": "Não consegui falar com a IA de voz agora. Tente de novo."})
            await ws.close()
        except (RuntimeError, WebSocketDisconnect):
            pass
