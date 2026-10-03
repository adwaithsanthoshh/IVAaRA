"""
IVaaRA Backend – Application Settings
"""
from functools import lru_cache
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_secret_key: str = "change-me-in-production"
    log_level: str = "INFO"

    # Database
    database_url: str = "sqlite+aiosqlite:///./ivara.db"

    # MQTT
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: Optional[str] = None
    mqtt_password: Optional[str] = None
    mqtt_client_id: str = "ivara-backend"
    mqtt_keepalive: int = 60

    # CORS / Frontend
    frontend_url: str = "http://localhost:5173"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    # Device
    device_offline_timeout: int = 30
    telemetry_max_records: int = 10000
    telemetry_interval: int = 5

    # Risk
    risk_threshold_low: int = 30
    risk_threshold_moderate: int = 60
    risk_threshold_high: int = 80

    # Telegram
    telegram_enabled: bool = False
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None

    # Groq AI — up to 3 API keys, tried in order, failover to next on error
    # Set GROQ_API_KEY_1, _2, _3 for key rotation/failover
    # Legacy: GROQ_API_KEY also accepted (used as key 1 if _1 is empty)
    groq_api_key: Optional[str] = None       # legacy single-key (GROQ_API_KEY)
    groq_api_key_1: Optional[str] = None     # primary key
    groq_api_key_2: Optional[str] = None     # fallback key 2
    groq_api_key_3: Optional[str] = None     # fallback key 3
    groq_model: str = "llama-3.3-70b-versatile"
    groq_enabled: bool = True
    groq_timeout: int = 15             # seconds per request
    groq_max_tokens: int = 512
    groq_ai_cooldown: int = 30         # min seconds between analyses per device

    @property
    def groq_keys(self) -> list[str]:
        """Return all configured Groq API keys in priority order (deduplicated)."""
        keys: list[str] = []
        seen: set[str] = set()
        # Priority: _1 > _2 > _3 > legacy
        candidates = [
            self.groq_api_key_1,
            self.groq_api_key_2,
            self.groq_api_key_3,
            self.groq_api_key,   # legacy fallback
        ]
        for k in candidates:
            if k and k.strip() and k.strip() not in seen:
                keys.append(k.strip())
                seen.add(k.strip())
        return keys

    @property
    def ai_available(self) -> bool:
        return len(self.groq_keys) > 0




@lru_cache()
def get_settings() -> Settings:
    return Settings()
