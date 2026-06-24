"""
认证服务：密码哈希 + JWT 签发/验证。

使用 bcrypt（passlib）进行密码哈希，使用 python-jose 进行 JWT 签发和解码。
这些是独立的工具函数，不涉及数据库操作，可以被路由层直接调用。
"""
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta

from config import settings

# bcrypt 哈希上下文，自动处理盐值和轮数
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """bcrypt 哈希密码（自动加盐）"""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """验证明文密码是否匹配 bcrypt 哈希"""
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    """
    签发 JWT Token。

    payload 包含：
    - sub: 用户 ID
    - exp: 过期时间（默认 7 天）

    注意：当前没有 token 撤销机制，管理员禁用用户后
    已有 token 仍然有效直到过期。
    """
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> str:
    """解码 JWT Token，返回 user_id。失败抛 JWTError。"""
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    return payload["sub"]
