"""Login da Linnea na nuvem (Supabase Auth). Só vale com LINNEA_MODO=nuvem; no PC o app não pede login
(ele só aceita acesso do próprio computador).

- /api/login: e-mail e senha -> o Supabase devolve um "token" (vale ~1 hora) e um código para renová-lo.
- Toda chamada a /api precisa mandar o token (cabeçalho Authorization; na voz, ?token= no endereço).
- Algumas rotas só fazem sentido no PC (mexem ou listam arquivos): na nuvem respondem 403."""

import json
import os
import time
import urllib.error
import urllib.request

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

PUBLIC = {"/api/health", "/api/login", "/api/login/renovar"}  # funcionam sem login
LOCAL_ONLY = {"/api/pastas", "/api/arquivos", "/api/arquivo", "/api/lixeira", "/api/etiquetas-ia"}  # só no app do PC
CACHE_S = 300  # um token conferido vale 5 minutos sem perguntar de novo ao Supabase
_checked = {}  # token -> quando foi conferido


def _auth(path: str, body=None, token=None) -> dict:
    key = os.environ["SUPABASE_API_PUBLISH_KEY"]  # a chave pública basta para o login
    headers = {"apikey": key, "Content-Type": "application/json", "Authorization": f"Bearer {token or key}"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1" + path, data=data, headers=headers, method="POST" if data else "GET"
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def _tokens(answer: dict) -> dict:
    return {"token": answer["access_token"], "renovar": answer["refresh_token"]}


def login(email: str, senha: str) -> dict | None:
    """Tokens do usuário, ou None se o e-mail ou a senha estiverem errados."""
    try:
        return _tokens(_auth("/token?grant_type=password", {"email": email, "password": senha}))
    except urllib.error.HTTPError:
        return None


def refresh(code: str) -> dict | None:
    """Tokens novos a partir do código de renovação (o token vence em ~1 hora)."""
    try:
        return _tokens(_auth("/token?grant_type=refresh_token", {"refresh_token": code}))
    except urllib.error.HTTPError:
        return None


def valid(token: str) -> bool:
    """True se o token é de um login válido (pergunta ao Supabase, com cache de 5 minutos)."""
    if not token:
        return False
    if time.monotonic() - _checked.get(token, -CACHE_S) < CACHE_S:
        return True
    try:
        _auth("/user", token=token)
    except (urllib.error.URLError, ValueError):
        return False
    _checked[token] = time.monotonic()
    return True


async def require_login(request: Request, call_next):
    """Middleware: na nuvem, barra quem não fez login e as rotas que só existem no PC."""
    path = request.url.path
    if not path.startswith("/api/") or path in PUBLIC or path == "/api/voz":  # a voz confere o token sozinha
        return await call_next(request)
    if path in LOCAL_ONLY or (path == "/api/config" and request.method == "PUT"):
        return JSONResponse({"detail": "Isso só dá para fazer no app do PC."}, status_code=403)
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not await run_in_threadpool(valid, token):  # em outra thread: a pergunta ao Supabase não trava a API
        return JSONResponse({"detail": "Faça login de novo."}, status_code=401)
    return await call_next(request)
