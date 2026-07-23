import base64
import hashlib
import hmac
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HOOK_DIR = Path(__file__).resolve().parent
LOG_FILE = HOOK_DIR / "feishu-hook.log"


def log(msg: str) -> None:
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    try:
        sys.stderr.write(f"[Feishu Hook] {msg}\n")
        sys.stderr.flush()
    except Exception:
        pass
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def load_windows_user_env() -> None:
    if sys.platform != "win32":
        return
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
            for name in ("FEISHU_WEBHOOK_URL", "FEISHU_BOT_SECRET"):
                if os.environ.get(name):
                    continue
                try:
                    value, _ = winreg.QueryValueEx(key, name)
                    if value:
                        os.environ[name] = str(value)
                except FileNotFoundError:
                    pass
    except OSError as exc:
        log(f"read user env failed: {exc}")


def load_dotenv_files() -> None:
    candidates = [
        HOOK_DIR / ".env",
        HOOK_DIR.parent / ".env",
        Path.cwd() / ".cursor" / "hooks" / ".env",
        Path.cwd() / ".env",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
            log(f"loaded env file: {path}")
        except OSError as exc:
            log(f"read env file failed: {path} {exc}")


def generate_sign(timestamp: str, secret: str) -> str:
    string_to_sign = f"{timestamp}\n{secret}".encode("utf-8")
    digest = hmac.new(string_to_sign, digestmod=hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def get_project_name(payload: dict) -> str:
    workspace_roots = payload.get("workspace_roots") or []
    if workspace_roots:
        root = str(workspace_roots[0]).replace("\\", "/")
        # Cursor on Windows may pass "/d:/path"
        if len(root) >= 3 and root[0] == "/" and root[2] == ":":
            root = root[1:]
        return Path(root).name or "unknown"
    return Path.cwd().name or "unknown"


def send_feishu_message(text: str) -> None:
    webhook_url = os.getenv("FEISHU_WEBHOOK_URL")
    secret = os.getenv("FEISHU_BOT_SECRET")
    if not webhook_url:
        raise RuntimeError("FEISHU_WEBHOOK_URL missing")

    body = {"msg_type": "text", "content": {"text": text}}
    if secret:
        timestamp = str(int(time.time()))
        body["timestamp"] = timestamp
        body["sign"] = generate_sign(timestamp, secret)

    request = Request(
        webhook_url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=15) as response:
        result = json.loads(response.read().decode("utf-8"))
    code = result.get("code", result.get("StatusCode", 0))
    if code != 0:
        raise RuntimeError(f"feishu api error: {result}")


def parse_payload(raw: str) -> dict:
    raw = (raw or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        # Windows launcher 有时 stdin 损坏；仍发通知，不中断
        log("stdin json invalid; using empty payload")
        return {}


def main() -> int:
    load_windows_user_env()
    load_dotenv_files()

    try:
        raw_input = sys.stdin.read()
    except Exception as exc:  # noqa: BLE001
        log(f"stdin read failed: {exc}")
        raw_input = ""

    payload = parse_payload(raw_input)
    log(
        f"run cwd={Path.cwd()} has_url={bool(os.getenv('FEISHU_WEBHOOK_URL'))} "
        f"has_secret={bool(os.getenv('FEISHU_BOT_SECRET'))} "
        f"stdin_len={len(raw_input or '')} status={payload.get('status')}"
    )

    try:
        project_name = get_project_name(payload)
        status = str(payload.get("status") or "completed")
        finished_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        message = (
            "Cursor task finished\n"
            f"project: {project_name}\n"
            f"status: {status}\n"
            f"time: {finished_time}"
        )
        send_feishu_message(message)
        log(f"sent ok project={project_name} status={status}")
    except Exception as exc:  # noqa: BLE001
        log(f"send failed: {exc}")

    # 必须先刷 stdout，再 exit 0（Windows Hook 缓冲问题）
    try:
        sys.stdout.write("{}\n")
        sys.stdout.flush()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
