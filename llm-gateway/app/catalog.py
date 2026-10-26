"""Provider presets and reference purchase prices (USD per 1M tokens). Verify prices before launch!"""

PRESETS = {
    "openai": {"name": "OpenAI", "type": "openai", "base_url": "https://api.openai.com/v1"},
    "anthropic": {"name": "Anthropic", "type": "anthropic", "base_url": "https://api.anthropic.com/v1"},
    "google": {"name": "Google Gemini", "type": "openai_compatible",
               "base_url": "https://generativelanguage.googleapis.com/v1beta/openai"},
    "deepseek": {"name": "DeepSeek", "type": "openai_compatible", "base_url": "https://api.deepseek.com/v1"},
    "xai": {"name": "xAI Grok", "type": "openai_compatible", "base_url": "https://api.x.ai/v1"},
    "mistral": {"name": "Mistral", "type": "openai_compatible", "base_url": "https://api.mistral.ai/v1"},
    "groq": {"name": "Groq", "type": "openai_compatible", "base_url": "https://api.groq.com/openai/v1"},
    "openrouter": {"name": "OpenRouter", "type": "openai_compatible", "base_url": "https://openrouter.ai/api/v1"},
    "together": {"name": "Together AI", "type": "openai_compatible", "base_url": "https://api.together.xyz/v1"},
    "custom": {"name": "Свой провайдер", "type": "openai_compatible", "base_url": ""},
}

# prefix -> (input, output, context, vision)
PRICES = {
    "gpt-5-nano": (0.05, 0.40, 400000, True),
    "gpt-5-mini": (0.25, 2.00, 400000, True),
    "gpt-5": (1.25, 10.00, 400000, True),
    "gpt-4.1-nano": (0.10, 0.40, 1047576, True),
    "gpt-4.1-mini": (0.40, 1.60, 1047576, True),
    "gpt-4.1": (2.00, 8.00, 1047576, True),
    "gpt-4o-mini": (0.15, 0.60, 128000, True),
    "gpt-4o": (2.50, 10.00, 128000, True),
    "o4-mini": (1.10, 4.40, 200000, True),
    "o3-mini": (1.10, 4.40, 200000, False),
    "o3": (2.00, 8.00, 200000, True),
    "o1": (15.00, 60.00, 200000, True),
    "text-embedding-3-small": (0.02, 0, 8191, False),
    "text-embedding-3-large": (0.13, 0, 8191, False),
    "claude-opus-4": (15.00, 75.00, 200000, True),
    "claude-sonnet-4": (3.00, 15.00, 200000, True),
    "claude-haiku-4": (1.00, 5.00, 200000, True),
    "claude-3-7-sonnet": (3.00, 15.00, 200000, True),
    "claude-3-5-sonnet": (3.00, 15.00, 200000, True),
    "claude-3-5-haiku": (0.80, 4.00, 200000, True),
    "claude-3-haiku": (0.25, 1.25, 200000, True),
    "gemini-2.5-pro": (1.25, 10.00, 1048576, True),
    "gemini-2.5-flash-lite": (0.10, 0.40, 1048576, True),
    "gemini-2.5-flash": (0.30, 2.50, 1048576, True),
    "gemini-2.0-flash": (0.10, 0.40, 1048576, True),
    "deepseek-chat": (0.27, 1.10, 128000, False),
    "deepseek-reasoner": (0.55, 2.19, 128000, False),
    "grok-4": (3.00, 15.00, 256000, True),
    "grok-3-mini": (0.30, 0.50, 131072, False),
    "grok-3": (3.00, 15.00, 131072, False),
    "mistral-large": (2.00, 6.00, 128000, False),
    "mistral-small": (0.10, 0.30, 128000, False),
}


def lookup(model_id: str):
    mid = model_id.lower().split("/")[-1]
    best = None
    for prefix in PRICES:
        if mid.startswith(prefix) and (best is None or len(prefix) > len(best)):
            best = prefix
    return PRICES.get(best) if best else None
