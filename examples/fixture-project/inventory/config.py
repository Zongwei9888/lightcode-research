"""Settings for the inventory service."""

DEFAULTS = {
    "currency": "EUR",
    "tax_rate": 0.2,
    "retry_backoff": 1.5,
    "max_retries": 3,
}


def parse_config(raw):
    """Merge user settings over the defaults and validate them."""
    merged = dict(raw)
    for key in ("currency", "tax_rate", "max_retries"):
        merged.setdefault(key, DEFAULTS[key])
    backoff = merged["retry_backoff"]
    if backoff <= 0:
        raise ValueError("retry_backoff must be positive")
    if merged["max_retries"] < 0:
        raise ValueError("max_retries must not be negative")
    return merged
