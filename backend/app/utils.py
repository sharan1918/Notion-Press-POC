"""Shared utility functions for the Notion Press email processing backend."""
from typing import Any


def extract_content_str(content_val: Any) -> str:
    """
    Extract a string from varied LLM response content types.
    
    Handles None, str, lists of chunks/parts, dictionaries with 'text' keys,
    and objects with a 'text' attribute.
    """
    if content_val is None:
        return ""
    if isinstance(content_val, str):
        return content_val
    if isinstance(content_val, list):
        parts = []
        for item in content_val:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
            elif hasattr(item, "text"):
                parts.append(str(getattr(item, "text")))
            else:
                parts.append(str(item))
        return "".join(parts)
    return str(content_val)


# Backward compatibility alias
_extract_content_str = extract_content_str
