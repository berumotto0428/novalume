from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from jose import JWTError
from datetime import datetime
from pydantic import BaseModel
import os
import shutil

from database import get_db, SessionLocal
from models.user import User
from models.knowledge_base import KnowledgeBase
from schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from services.auth_service import hash_password, verify_password, create_access_token, decode_token
from services.vector_service import vector_service
from config import settings

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer()

AVATAR_DIR = os.path.join(settings.file_storage_dir, "..", "storage", "avatars")


def _avatar_url(user_id: str) -> str | None:
    """检查用户是否有头像文件，返回 URL"""
    for ext in (".webp", ".jpg", ".jpeg", ".png"):
        path = os.path.join(AVATAR_DIR, f"{user_id}{ext}")
        if os.path.exists(path):
            return f"/api/auth/avatar/{user_id}"
    return None


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        is_admin=user.is_admin,
        avatar_url=_avatar_url(user.id),
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        user_id = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已被禁用")
    return user


@router.post("/register", response_model=TokenResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == request.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=400, detail="邮箱已被注册")
    user = User(
        username=request.username,
        email=request.email,
        password_hash=hash_password(request.password),
    )
    db.add(user)
    db.commit()
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=_user_to_response(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        (User.username == request.username_or_email) | (User.email == request.username_or_email)
    ).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名/邮箱或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="该账号已被禁用，请联系管理员")
    user.last_login_at = datetime.utcnow()
    db.commit()
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=_user_to_response(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return _user_to_response(current_user)


class ProfileUpdate(BaseModel):
    username: str | None = None
    email: str | None = None


@router.put("/profile", response_model=UserResponse)
def update_profile(
    request: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if request.username is not None:
        if request.username != current_user.username:
            existing = db.query(User).filter(User.username == request.username).first()
            if existing:
                raise HTTPException(status_code=400, detail="用户名已存在")
        current_user.username = request.username
    if request.email is not None:
        if request.email != current_user.email:
            existing = db.query(User).filter(User.email == request.email).first()
            if existing:
                raise HTTPException(status_code=400, detail="邮箱已被注册")
        current_user.email = request.email
    db.commit()
    return _user_to_response(current_user)


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


@router.put("/password")
def change_password(
    request: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(request.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="旧密码错误")
    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码长度不能少于6位")
    current_user.password_hash = hash_password(request.new_password)
    db.commit()
    return {"message": "密码已修改"}


@router.delete("/account")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 清理知识库的磁盘文件和 ChromaDB
    for kb in current_user.knowledge_bases:
        kb_dir = os.path.join(settings.file_storage_dir, kb.id)
        if os.path.exists(kb_dir):
            shutil.rmtree(kb_dir)
        vector_service.delete_collection(kb.id)

    # 清理头像
    avatar_dir = os.path.join(settings.file_storage_dir, "..", "storage", "avatars")
    for ext in (".webp", ".jpg", ".jpeg", ".png"):
        path = os.path.join(avatar_dir, f"{current_user.id}{ext}")
        if os.path.exists(path):
            os.remove(path)

    db.delete(current_user)  # cascade 删除 KB / 文档 / 对话 / 消息
    db.commit()
    return {"message": "账号已注销"}


ALLOWED_EXTENSIONS = {".webp", ".jpg", ".jpeg", ".png"}


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="仅支持 jpg/png/webp 格式")

    # 删除旧头像
    for old_ext in ALLOWED_EXTENSIONS:
        old_path = os.path.join(AVATAR_DIR, f"{current_user.id}{old_ext}")
        if os.path.exists(old_path):
            os.remove(old_path)

    os.makedirs(AVATAR_DIR, exist_ok=True)
    save_path = os.path.join(AVATAR_DIR, f"{current_user.id}{ext}")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="头像文件不能超过 2MB")
    with open(save_path, "wb") as f:
        f.write(content)

    current_user.avatar_path = save_path
    db.commit()
    return {"message": "头像已更新", "avatar_url": f"/api/auth/avatar/{current_user.id}"}


@router.get("/avatar/{user_id}")
def get_avatar(user_id: str, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    for ext in ALLOWED_EXTENSIONS:
        path = os.path.join(AVATAR_DIR, f"{user_id}{ext}")
        if os.path.exists(path):
            return FileResponse(path, media_type=f"image/{ext[1:]}")
    raise HTTPException(status_code=404, detail="头像不存在")
