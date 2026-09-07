"""Admin CLI for user/drone management.

Run from the backend directory, e.g.:

    python manage.py create-admin admin 'a-strong-password'
    python manage.py create-user viewer1 'some-password' viewer
    python manage.py list-drones
"""
import argparse
import os
import sys

# Allow running from the backend directory without installing the package.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Keep Chinese output readable on Windows consoles that default to GBK.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app import db  # noqa: E402
from app.auth import hash_password  # noqa: E402


def create_admin(username: str, password: str) -> None:
    existing = db.query_one("SELECT id FROM users WHERE username = ?", (username,))
    if existing is not None:
        print(f"账号 {username} 已存在")
        return
    db.execute(
        "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', datetime('now'))",
        (username, hash_password(password)),
    )
    db.add_log("cli", "create_admin", f"创建管理员 {username}")
    print(f"管理员 {username} 创建成功")


def create_user(username: str, password: str, role: str) -> None:
    existing = db.query_one("SELECT id FROM users WHERE username = ?", (username,))
    if existing is not None:
        print(f"账号 {username} 已存在")
        return
    db.execute(
        "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, datetime('now'))",
        (username, hash_password(password), role),
    )
    db.add_log("cli", "create_user", f"创建账号 {username}（{role}）")
    print(f"账号 {username}（{role}）创建成功")


def list_drones() -> None:
    rows = db.query("SELECT sysid, name, enabled, created_at FROM drones ORDER BY sysid")
    if not rows:
        print("（暂无登记无人机）")
        return
    print(f"{'sysid':>6}  {'enabled':>7}  name")
    for r in rows:
        print(f"{r['sysid']:>6}  {str(bool(r['enabled'])):>7}  {r['name']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="LumiDrone 管理命令行")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_admin = sub.add_parser("create-admin", help="创建管理员账号")
    p_admin.add_argument("username")
    p_admin.add_argument("password")

    p_user = sub.add_parser("create-user", help="创建普通/观察账号")
    p_user.add_argument("username")
    p_user.add_argument("password")
    p_user.add_argument("role", nargs="?", default="viewer", choices=["admin", "viewer"])

    sub.add_parser("list-drones", help="列出已登记无人机")

    args = parser.parse_args()

    if args.cmd == "create-admin":
        create_admin(args.username, args.password)
    elif args.cmd == "create-user":
        create_user(args.username, args.password, args.role)
    elif args.cmd == "list-drones":
        list_drones()


if __name__ == "__main__":
    main()
