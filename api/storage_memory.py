"""In-memory user store (matches Node MemStorage used for auth)."""

from __future__ import annotations

import bcrypt
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class User:
    id: int
    email: str
    password: str
    first_name: Optional[str]
    last_name: Optional[str]
    role: str
    username: Optional[str] = None


class MemStorage:
    def __init__(self) -> None:
        self._users: dict[int, User] = {}
        self._next_id = 1

    def get_user(self, user_id: int) -> Optional[User]:
        return self._users.get(user_id)

    def get_user_by_email(self, email: str) -> Optional[User]:
        for u in self._users.values():
            if u.email == email:
                return u
        return None

    def create_user(
        self,
        email: str,
        password_hash: str,
        first_name: str = "Demo",
        last_name: str = "User",
        role: str = "user",
    ) -> User:
        uid = self._next_id
        self._next_id += 1
        u = User(
            id=uid,
            email=email,
            password=password_hash,
            first_name=first_name,
            last_name=last_name,
            role=role,
        )
        self._users[uid] = u
        return u


storage = MemStorage()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False
