"""Human-friendly (Russian) error messages for API clients."""
import difflib
import re

from .config import PUBLIC_URL

KEYS_URL = f"{PUBLIC_URL}/#/keys"
BILLING_URL = f"{PUBLIC_URL}/#/billing"
MODELS_URL = f"{PUBLIC_URL}/#/models"


def suggest(name: str, ids: list[str], n: int = 3) -> list[str]:
    """Closest model ids for a mistyped name."""
    low = {i.lower(): i for i in ids}
    q = (name or "").lower().strip()
    found = difflib.get_close_matches(q, list(low), n=n, cutoff=0.55)
    if not found:  # substring match: "sonnet" -> "claude-sonnet-4-5"
        found = [k for k in low if q and (q in k or k in q)][:n]
    return [low[f] for f in found]


def model_not_found(name: str, ids: list[str]) -> str:
    s = suggest(name, ids)
    hint = f" Возможно, вы имели в виду: {', '.join(s)}." if s else ""
    return f"Модель «{name}» не найдена.{hint} Список доступных моделей: {MODELS_URL}"


_PATTERNS = [
    (r"context.length|context_length_exceeded|maximum context|prompt is too long|too many tokens|"
     r"input is too long|reduce the length|exceeds the context", "context"),
    (r"max_tokens|max_completion_tokens|max_output_tokens", "max_tokens"),
    (r"image|vision|multimodal", "image"),
    (r"tool|function.call", "tools"),
    (r"content.policy|content_filter|safety|flagged|moderation", "policy"),
    (r"temperature|top_p", "sampling"),
]


def upstream_bad_request(raw_message: str, model) -> str:
    """Translate a provider's 4xx message into something actionable."""
    t = (raw_message or "").lower()
    kind = next((k for rx, k in _PATTERNS if re.search(rx, t)), None)
    name = model.public_id
    if kind == "context":
        return (f"Запрос слишком длинный для модели {name}: её контекст {model.context_length:,} токенов."
                .replace(",", " ") + " Сократите историю сообщений или выберите модель с большим контекстом.")
    if kind == "max_tokens":
        return (f"Слишком большое значение max_tokens для модели {name}. Максимум для ответа: "
                f"{model.max_output:,} токенов.".replace(",", " "))
    if kind == "image":
        return (f"Модель {name} не смогла обработать изображение. Убедитесь, что модель поддерживает картинки "
                f"(отметка Vision в каталоге) и что файл в формате JPEG, PNG, GIF или WebP.")
    if kind == "tools":
        return f"Модель {name} не поддерживает вызов функций (tools) или параметр tools задан неверно."
    if kind == "policy":
        return "Запрос отклонён фильтром безопасности провайдера. Измените формулировку и попробуйте снова."
    if kind == "sampling":
        return f"Недопустимое значение temperature или top_p для модели {name}."
    return f"Модель {name} отклонила запрос: {raw_message}"[:1500]


# Short texts for the client's request history (no provider details)
STATUS_TEXT = {
    400: "Некорректный запрос",
    401: "Неверный API-ключ",
    402: "Недостаточно средств",
    404: "Модель не найдена",
    413: "Запрос слишком большой",
    422: "Некорректные параметры",
    429: "Слишком много запросов",
    502: "Провайдер временно недоступен",
    503: "Модель временно недоступна",
}
