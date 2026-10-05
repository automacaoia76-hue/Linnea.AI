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
from datetime import datetime

try:
    import winreg
except ImportError:  # Linux (Linnea na nuvem): nada daqui roda lá
    winreg = None

from langchain.tools import tool

from paths import CLOUD, DATA_DIR
from tools.disk_scan import GB, SYSTEM_DRIVE, fixed_drives
from tools.retrato import retrato

SCAN_FILE = DATA_DIR / "scan.json"
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


# Peças do PC pelo Windows (CIM). Demora uns 4 s, então guarda o resultado: as peças não mudam com o app aberto.
HARDWARE_SCRIPT = r"""
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1 Manufacturer, Product
$ram = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed, ConfiguredClockSpeed, Manufacturer, PartNumber)
$gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion)
$disks = @(Get-PhysicalDisk | Select-Object FriendlyName, MediaType, Size, BusType)
$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, BuildNumber
@{ cpu = $cpu; placa_mae = $board; ram = $ram; gpu = $gpu; discos = $disks; windows = $os } | ConvertTo-Json -Depth 4 -Compress
"""
_hardware_cache = None


def hardware_info() -> dict:
    """Processador, placa-mãe, memória (cada pente), placa de vídeo, discos e Windows."""
    global _hardware_cache
    if CLOUD:  # na nuvem: as peças do último retrato
        return retrato().get("pecas", {})
    if _hardware_cache is not None:
        return _hardware_cache
    raw = subprocess.run(
        ["powershell", "-NoProfile", "-Command", HARDWARE_SCRIPT],
        capture_output=True, text=True, encoding="utf-8", timeout=30, creationflags=subprocess.CREATE_NO_WINDOW,
    ).stdout
    data = json.loads(raw)
    cpu, board, system = data["cpu"], data["placa_mae"], data["windows"]
    sticks = [
        {
            "gb": round(stick["Capacity"] / GB),
            "velocidade_atual_mhz": stick.get("ConfiguredClockSpeed") or stick.get("Speed"),
            "fabricante": (stick.get("Manufacturer") or "").strip(),
            "modelo": (stick.get("PartNumber") or "").strip(),  # às vezes traz a velocidade de fábrica (ex.: "DDR4 3200")
        }
        for stick in data["ram"]
    ]
    nvidia = _nvidia_details()
    video = [
        {"modelo": card["Name"], "memoria_gb": round((card.get("AdapterRAM") or 0) / GB, 1), "driver": card.get("DriverVersion")}
        for card in data["gpu"]
    ]
    if nvidia:  # o nvidia-smi informa a memória certa (o Windows limita a 4 GB nesse campo)
        video = [nvidia] + [card for card in video if card["modelo"] != nvidia["modelo"]]
    _hardware_cache = {
        "processador": {
            "modelo": cpu["Name"].strip(),
            "nucleos": cpu["NumberOfCores"],
            "threads": cpu["NumberOfLogicalProcessors"],
            "ghz": round(cpu["MaxClockSpeed"] / 1000, 1),
        },
        "placa_mae": f"{board['Manufacturer'].strip()} {board['Product'].strip()}",
        "memoria_ram": {"total_gb": sum(s["gb"] for s in sticks), "pentes": sticks},
        "placa_de_video": video,
        "discos": [
            {"modelo": disk["FriendlyName"].strip(), "tamanho_gb": round(disk["Size"] / 1e9), "tipo": disk["MediaType"], "conexao": disk["BusType"]}
            for disk in data["discos"]
        ],
        "windows": f"{system['Caption']} (build {system['BuildNumber']})",
    }
    return _hardware_cache


def _nvidia_details():
    try:
        line = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5, creationflags=subprocess.CREATE_NO_WINDOW,
        ).stdout.strip().splitlines()[0]
        name, memory_mb, driver = [part.strip() for part in line.split(",")]
        return {"modelo": name, "memoria_gb": round(int(memory_mb) / 1024, 1), "driver": driver}
    except (OSError, IndexError, ValueError, subprocess.SubprocessError):
        return None


@tool
def ver_configuracao_pc() -> str:
    """Mostra a configuração do PC e como ele está agora: processador, placa-mãe, placa de vídeo, memória RAM
    (cada pente e a velocidade em que está rodando), discos, versão do Windows, uso de CPU/GPU/RAM, temperaturas
    e a nota de saúde. Só lê. Use quando perguntarem sobre as peças do PC, se ele aguenta um jogo ou programa,
    o que dá para melhorar ou por que ele está lento."""
    try:
        hardware = hardware_info()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        hardware = {"erro": "Não consegui ler as peças do PC agora."}
    result = {"pecas": hardware, "agora": pc_health()}
    if CLOUD:  # na nuvem: avisa de quando são os dados (o PC pode estar desligado)
        result["retrato_de"] = retrato().get("feito_em")
    return json.dumps(result, ensure_ascii=False)


def pc_health() -> dict:
    if CLOUD:  # na nuvem: a saúde do último retrato
        return retrato().get("saude", {})
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
        "discos": fixed_drives(),  # todos os discos (a nota usa só o do Windows, que é o que trava o PC quando enche)
        "verificado_em": datetime.now().isoformat(timespec="seconds"),
    }
