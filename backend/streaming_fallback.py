"""Middleware do agente: streaming de palavras + modelo reserva com prazo para COMEÇAR a responder.

Como funciona, a cada chamada ao modelo dentro do loop ReAct:
1. Chama o modelo principal (Qwen) e espera até `first_token_timeout` segundos pelo primeiro sinal de vida.
2. Se ele começar a tempo, segue até o fim; cada palavra vai para a tela na hora (stream "custom" do LangGraph).
3. Se ele não começar a tempo, ou der erro (ex.: 429 lotado), abandona e chama o modelo reserva (DeepSeek).
4. Depois de uma falha, o principal fica "pausado" por 60 s: os próximos passos vão direto para a reserva.

Por que não usar o timeout do próprio pacote: a OpenRouter abre a conexão na hora e só depois manda o texto,
então o timeout da conexão não mede "quanto falta para começar".
"""

import queue
import time
from concurrent.futures import ThreadPoolExecutor

from langchain.agents.middleware import AgentMiddleware
from langchain_core.callbacks import BaseCallbackHandler
from langgraph.config import get_stream_writer

_executor = ThreadPoolExecutor(max_workers=8)


class _TokenRelay(BaseCallbackHandler):
    """Recebe cada pedaço que o modelo gera e repassa por uma fila (enquanto estiver ativo)."""

    def __init__(self):
        self.tokens = queue.Queue()
        self.started = False  # vira True no primeiro pedaço (texto, chamada de ferramenta ou raciocínio)
        self.active = True  # vira False quando abandonamos este modelo: para de repassar palavras

    def on_llm_new_token(self, token, **kwargs):
        self.started = True
        if self.active and token:
            self.tokens.put(token)


class StreamingFallback(AgentMiddleware):
    def __init__(self, primary, fallback, first_token_timeout=10.0, pause_after_failure=60.0):
        super().__init__()
        self.primary = primary
        self.fallback = fallback
        self.first_token_timeout = first_token_timeout
        # Depois que o principal falha, pula ele por um tempo (assim não esperamos o prazo de novo a cada passo)
        self.pause_after_failure = pause_after_failure
        self.primary_paused_until = 0.0

    def _run(self, request, handler, model, deadline):
        """Roda uma chamada ao modelo numa thread, mandando as palavras para a tela enquanto chegam.
        Devolve a resposta, ou None se o modelo não começou antes do prazo."""
        writer = get_stream_writer()  # canal "custom" do LangGraph (a API repassa para o navegador)
        relay = _TokenRelay()
        # Cópia do modelo com o nosso "ouvinte" de palavras (o modelo original fica intacto)
        listening_model = model.model_copy(update={"callbacks": [relay]})
        future = _executor.submit(handler, request.override(model=listening_model))

        while True:
            try:
                writer({"token": relay.tokens.get(timeout=0.05)})
                continue
            except queue.Empty:
                pass
            if future.done():
                while not relay.tokens.empty():  # manda o que sobrou na fila
                    writer({"token": relay.tokens.get()})
                return future.result()  # se o modelo deu erro, ele sobe daqui
            if deadline and not relay.started and time.monotonic() > deadline:
                relay.active = False  # abandona: se ele ainda responder depois, ignoramos
                return None

    def wrap_model_call(self, request, handler):
        if time.monotonic() >= self.primary_paused_until:
            try:
                response = self._run(request, handler, self.primary, time.monotonic() + self.first_token_timeout)
                if response is not None:
                    return response
            except Exception:  # noqa: BLE001 — qualquer falha do principal (429, rede...) leva à reserva
                pass
            self.primary_paused_until = time.monotonic() + self.pause_after_failure
            get_stream_writer()({"switch": self.fallback.model_name})  # avisa a tela que trocou de modelo
        return self._run(request, handler, self.fallback, deadline=None)
