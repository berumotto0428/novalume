"""
创建管理员账号
运行方式：cd backend && python scripts/create_admin.py

交互式输入用户名、邮箱、密码，创建一个 is_admin=True 的用户。
若用户名/邮箱已存在，提示是否将其升级为管理员。
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models.user import User
from services.auth_service import hash_password
import getpass


def main():
    db = SessionLocal()
    try:
        username = input("管理员用户名: ").strip()
        if not username:
            print("用户名不能为空")
            return

        existing = db.query(User).filter(User.username == username).first()
        if existing:
            confirm = input(f"用户 {username} 已存在，是否升级为管理员？(y/n): ").strip()
            if confirm.lower() == "y":
                existing.is_admin = True
                db.commit()
                print(f"用户 {username} 已升级为管理员")
            else:
                print("已取消")
            return

        email = input("管理员邮箱: ").strip()
        if not email:
            print("邮箱不能为空")
            return

        password = getpass.getpass("管理员密码: ")
        if not password:
            print("密码不能为空")
            return
        if len(password) < 6:
            print("密码长度不能少于6位")
            return

        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            is_admin=True,
        )
        db.add(user)
        db.commit()
        print(f"管理员账号 {username} 创建成功")
    finally:
        db.close()


if __name__ == "__main__":
    main()
