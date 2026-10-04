"""Saúde do PC (tela do fone do robô): CPU, GPU, RAM, armazenamento e temperatura, lidos de verdade.
Usa só o que já vem com o Python e o Windows (sem bibliotecas novas):
- CPU: nome no registro do Windows e uso medido pelo próprio Windows (GetSystemTimes)
- RAM: GlobalMemoryStatusEx
- GPU: nvidia-smi (vem com o driver da NVIDIA); se não tiver, só o nome da placa
- Temperatura da CPU: o Windows não informa sozinho. Ela vem do LibreHardwareMonitor (programa grátis), se ele
  estiver aberto com o "Remote Web Server" ligado (porta 8085); senão, fica "indisponível"."""

import ctypes
import json
import shutil
import subprocess
import time
import urllib.request
import winreg
from datetime import datetime
from pathlib import Path

from tools.disk_scan import GB, SYSTEM_DRIVE

SCAN_FILE = Path(__file__).resolve().parent.parent / "data" / "scan.json"
SENSORS_URL = "http://localhost:8085/data.json"  # servidor do LibreHardwareMonitor


def _cpu_temperature():
    """Temperatura da CPU pelo LibreHardwareMonitor (None se ele não estiver aberto).
    Procura o sensor de temperatura do processador: "Core (Tctl/Tdie)" na AMD, "CPU Package" na Intel."""
    try:
        with urllib.request.urlopen(SENSORS_URL, timeout=1) as response:
            tree = json.load(response)
    except (OSError, ValueError):
        return None
    found = []

    def walk(node):
        sensor = node.get("SensorId") or ""
        if node.get("Type") == "Temperature" and sensor.startswith(("/amdcpu/", "/intelcpu/")):
            found.append(node)
        for child in node.get("Children", []):
            walk(child)

    walk(tree)
    best = next((n for n in found if "Tctl" in n["Text"] or "Package" in n["Text"]), found[0] if found else None)
    if best is None:
        return None
    try:
        return round(float(best["Value"].split()[0].replace(",", ".")))  # "44,5 °C" -> 44
    except (KeyError, ValueError, IndexError):
        return None


def _cpu_name() -> str:
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        return winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
    except OSError:
        return "Processador"


def _cpu_percent(sample_s: float = 0.5) -> int:
    """Uso da CPU: compara o tempo ocioso com o tempo total em duas medidas seguidas."""
    def times():
        idle, kernel, user = ctypes.c_ulonglong(), ctypes.c_ulonglong(), ctypes.c_ulonglong()
        ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user))
        return idle.value, kernel.value + user.value  # o tempo do kernel já inclui o ocioso

    idle1, total1 = times()
    time.sleep(sample_s)
    idle2, total2 = times()
    total = total2 - total1
    return round(100 * (total - (idle2 - idle1)) / total) if total else 0


class _MemoryStatus(ctypes.Structure):
    _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong), ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]


def _ram() -> dict:
    status = _MemoryStatus()
    status.dwLength = ctypes.sizeof(_MemoryStatus)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
    return {"uso": status.dwMemoryLoad, "total_gb": round(status.ullTotalPhys / GB, 1)}


def _gpu() -> dict:
    """Placa de vídeo pelo nvidia-smi (nome, uso, temperatura). Sem NVIDIA: só o nome, pelo Windows."""
    try:
        line = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5, creationflags=subprocess.CREATE_NO_WINDOW,
        ).stdout.strip().splitlines()[0]
        name, usage, temperature = [part.strip() for part in line.split(",")]
        return {"nome": name, "uso": int(usage), "temperatura": int(temperature)}
    except (OSError, IndexError, ValueError, subprocess.SubprocessError):
        pass
    try:
        name = subprocess.run(
            ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name"],
            capture_output=True, text=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        name = ""
    return {"nome": name or "Placa de vídeo", "uso": None, "temperatura": None}


def _score(cpu: int, ram: int, disk: int, cpu_temp, gpu_temp, junk_gb: float) -> tuple[int, str, list[str]]:
    """Nota de 0 a 100: começa em 100 e perde pontos pelo que está pesando. Devolve (nota, situação, problemas)."""
    score, issues = 100, []
    if disk >= 95:
        score -= 30
        issues.append(f"Disco quase cheio ({disk}%)")
    elif disk >= 90:
        score -= 20
        issues.append(f"Disco bem cheio ({disk}%)")
    elif disk >= 80:
        score -= 8
    if ram >= 90:
        score -= 15
        issues.append(f"Memória RAM no limite ({ram}%)")
    elif ram >= 75:
        score -= 6
    if cpu >= 90:
        score -= 15
        issues.append(f"Processador sobrecarregado ({cpu}%)")
    elif cpu >= 70:
        score -= 6
    if cpu_temp is not None and cpu_temp >= 85:
        score -= 15
        issues.append(f"Processador quente ({cpu_temp} °C)")
    elif cpu_temp is not None and cpu_temp >= 75:
        score -= 5
    if gpu_temp is not None and gpu_temp >= 85:
        score -= 15
        issues.append(f"Placa de vídeo quente ({gpu_temp} °C)")
    elif gpu_temp is not None and gpu_temp >= 75:
        score -= 5
    if junk_gb >= 5:
        score -= 8
        issues.append(f"{junk_gb:.1f} GB de lixo".replace(".", ","))
    elif junk_gb >= 2:
        score -= 4
        issues.append(f"{junk_gb:.1f} GB de lixo".replace(".", ","))
    score = max(score, 0)
    status = "Excelente" if score >= 85 else "Bom" if score >= 70 else "Atenção" if score >= 50 else "Crítico"
    return score, status, issues


def pc_health() -> dict:
    cpu = _cpu_percent()
    cpu_temp = _cpu_temperature()
    ram = _ram()
    gpu = _gpu()
    usage = shutil.disk_usage(SYSTEM_DRIVE)
    disk = round(100 * usage.used / usage.total)
    try:
        junk_gb = json.loads(SCAN_FILE.read_text(encoding="utf-8"))["lixo"]["tamanho_gb"]  # do último scan
    except (OSError, ValueError, KeyError):
        junk_gb = 0
    score, status, issues = _score(cpu, ram["uso"], disk, cpu_temp, gpu["temperatura"], junk_gb)
    return {
        "nota": score,
        "situacao": status,
        "problemas": issues,
        "cpu": {"nome": _cpu_name(), "uso": cpu, "temperatura": cpu_temp},  # None = LibreHardwareMonitor fechado
        "gpu": gpu,
        "ram": ram,
        "armazenamento": {"unidade": str(SYSTEM_DRIVE).rstrip("\\"), "total_gb": round(usage.total / GB), "uso": disk},
        "verificado_em": datetime.now().isoformat(timespec="seconds"),
    }
