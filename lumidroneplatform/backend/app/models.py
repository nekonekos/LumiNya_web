"""Pydantic request/response models."""
from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=4, max_length=256)
    role: str = Field(default="viewer", pattern="^(admin|viewer)$")


class DroneCreate(BaseModel):
    sysid: int = Field(ge=1, le=255)
    name: str = Field(min_length=1, max_length=64)
    description: str = Field(default="", max_length=512)


class DroneUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    description: Optional[str] = Field(default=None, max_length=512)
    enabled: Optional[bool] = None


class CommandRequest(BaseModel):
    command: str = Field(pattern="^(arm|disarm|takeoff|land|rtl|set_mode|goto)$")
    params: dict = Field(default_factory=dict)
