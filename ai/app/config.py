import os
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"


class Weights(BaseModel):
    llm: float = 0.6
    rules: float = 0.25
    emb: float = 0.15


class ModuleConfig(BaseModel):
    threshold: float = Field(default=0.6, ge=0, le=1)
    weights: Weights = Weights()


class OllamaConfig(BaseModel):
    llm_model: str
    embed_model: str
    timeout_s: float = 60.0


class Settings(BaseModel):
    ollama_url: str
    api_url: str
    ollama: OllamaConfig
    modules: dict[int, ModuleConfig]


@lru_cache
def get_settings() -> Settings:
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    return Settings(
        ollama_url=os.environ.get("OLLAMA_URL", "http://localhost:11434"),
        api_url=os.environ.get("API_URL", "http://localhost:3000"),
        **raw,
    )
