"""Testes das travas de segurança (rodar na pasta backend com: uv run pytest).

Nada aqui mexe nos seus arquivos de verdade: cada teste cria pastas falsas numa pasta temporária
e troca a Lixeira do Windows por uma lista (a "lixeira" abaixo), que só anota o que seria apagado."""

import os
import time

import pytest

from tools import file_tools


@pytest.fixture
def pc(tmp_path, monkeypatch):
    """PC de mentira: uma pasta Downloads pessoal, uma pasta de fora e a Lixeira falsa."""
    downloads = tmp_path / "Downloads"
    (downloads / "PDFs").mkdir(parents=True)
    (downloads / "PDFs" / "boleto.pdf").write_text("pdf")
    (downloads / "foto.jpg").write_text("jpg")
    fora = tmp_path / "Windows"
    fora.mkdir()
    (fora / "sistema.dll").write_text("dll")

    lixeira = []
    settings = {"nunca_apagar": []}
    monkeypatch.setattr(file_tools, "allowed_folders", lambda: [downloads])
    monkeypatch.setattr(file_tools, "_send_to_recycle_bin", lambda path: lixeira.append(path) or True)
    monkeypatch.setattr(file_tools, "load_settings", lambda: settings)
    monkeypatch.setattr(file_tools, "log_cleanup", lambda *args: None)
    return {"downloads": downloads, "fora": fora, "lixeira": lixeira, "settings": settings}


# ---------- Mover para a Lixeira ----------


def test_nunca_apaga_a_pasta_downloads_inteira(pc):
    moved, refused, _ = file_tools.move_paths([str(pc["downloads"])])
    assert moved == [] and len(refused) == 1
    assert pc["lixeira"] == []


def test_apaga_arquivo_e_subpasta_de_dentro_do_downloads(pc):
    moved, refused, _ = file_tools.move_paths([str(pc["downloads"] / "foto.jpg"), str(pc["downloads"] / "PDFs")])
    assert len(moved) == 2 and refused == []


def test_nunca_apaga_fora_das_pastas_pessoais(pc):
    moved, _, _ = file_tools.move_paths([str(pc["fora"] / "sistema.dll"), str(pc["fora"])])
    assert moved == [] and pc["lixeira"] == []


def test_truque_com_ponto_ponto_nao_escapa_do_downloads(pc):
    # Downloads/../Windows/sistema.dll parece estar no Downloads, mas na verdade aponta para fora
    truque = str(pc["downloads"] / ".." / "Windows" / "sistema.dll")
    moved, _, _ = file_tools.move_paths([truque])
    assert moved == [] and pc["lixeira"] == []


def test_respeita_a_lista_nunca_apagar(pc):
    pc["settings"]["nunca_apagar"] = [str(pc["downloads"] / "PDFs" / "boleto.pdf")]
    # nem o arquivo protegido, nem a pasta que tem ele dentro
    moved, refused, _ = file_tools.move_paths([str(pc["downloads"] / "PDFs" / "boleto.pdf"), str(pc["downloads"] / "PDFs")])
    assert moved == [] and len(refused) == 2
    assert all("nunca apagar" in motivo for motivo in refused)


# ---------- Duplicatas ----------


def test_nunca_apaga_a_ultima_copia(pc, monkeypatch):
    original = pc["downloads"] / "musica.mp3"
    copia = pc["downloads"] / "musica (1).mp3"
    for path in (original, copia):
        path.write_text("mesmo conteúdo")
    monkeypatch.setattr(file_tools, "find_duplicates", lambda: [(14, [str(original), str(copia)])])

    # pediram para apagar as DUAS cópias
    file_tools.apagar_duplicatas.invoke({"remover": [str(original), str(copia)]})

    assert pc["lixeira"] == [str(copia)]  # só a cópia "(1)" foi; a original ficou


def test_mantem_a_copia_sem_1_no_nome():
    assert file_tools._keep_choice(["C:/a/foto (1).jpg", "C:/a/foto.jpg", "C:/a/foto - Cópia.jpg"]) == "C:/a/foto.jpg"


# ---------- Temporários ----------


def test_temporarios_so_apaga_os_antigos(tmp_path):
    velho, novo = tmp_path / "velho.tmp", tmp_path / "novo.tmp"
    velho.write_text("x")
    novo.write_text("x")
    dois_dias_atras = time.time() - 2 * 86400
    os.utime(velho, (dois_dias_atras, dois_dias_atras))

    deleted, _ = file_tools.delete_old_temp(days=1, temp=tmp_path)

    assert deleted == 1 and not velho.exists() and novo.exists()
