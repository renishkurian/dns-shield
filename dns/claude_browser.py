"""
Claude.ai browser/session wrapper for DNS Shield.

Uses curl_cffi to call claude.ai web completion endpoints with a session cookie
(sessionKey) + organization UUID — not the Anthropic API.

Adapted from the MarketMind/claude browser client; trimmed to chat completions only.
"""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_BROWSER_PAYLOAD_PATH = Path(__file__).resolve().parent / 'claude_browser_payload.json'
_DEFAULT_MODEL = 'claude-sonnet-5'
_USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
)
_BROWSER_EXTRAS: Optional[dict] = None
_MINIMAL_TOOLS = []  # DNS Shield prompts don't need web_search by default


class ClaudeAuthError(PermissionError):
    pass


class ClaudeRateLimitError(RuntimeError):
    def __init__(self, message, resets_at: Optional[float] = None):
        super().__init__(message)
        self.resets_at = resets_at


class ClaudeOrgError(ValueError):
    """Organization id invalid or not accessible for this session."""


def normalize_org_id(org_id: str) -> str:
    """Strip whitespace and extract UUID if org_id was pasted from a Claude URL."""
    s = str(org_id or '').strip()
    if not s:
        return s
    m = re.search(
        r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
        s,
        re.I,
    )
    return m.group(1) if m else s


def _load_browser_extras() -> dict:
    global _BROWSER_EXTRAS
    if _BROWSER_EXTRAS is None:
        try:
            with open(_BROWSER_PAYLOAD_PATH, encoding='utf-8') as f:
                _BROWSER_EXTRAS = json.load(f)
        except Exception:
            _BROWSER_EXTRAS = {'personalized_styles': [], 'tools': []}
    return _BROWSER_EXTRAS


def get_headers(session_key: str) -> dict:
    return {
        'Cookie': f'sessionKey={session_key}',
        'User-Agent': _USER_AGENT,
        'Content-Type': 'application/json',
        'Referer': 'https://claude.ai/',
        'Origin': 'https://claude.ai',
    }


def _read_error_body(response) -> str:
    chunks = []
    try:
        for chunk in response.iter_content(chunk_size=1024):
            if chunk:
                chunks.append(chunk)
    except Exception:
        pass
    if chunks:
        return b''.join(chunks).decode('utf-8', errors='replace')
    try:
        return response.text or ''
    except Exception:
        return ''


def parse_rate_limit_error(response, default_msg: str):
    try:
        body_text = _read_error_body(response)
        err_json = json.loads(body_text)
        raw_msg = err_json.get('error', {}).get('message', '')
        try:
            msg_json = json.loads(raw_msg)
            resets_after = msg_json.get('resetsAfterSeconds')
            if resets_after is not None:
                return (
                    f'Rate limited by Claude.ai. Resets in {resets_after} seconds.',
                    None,
                )
            resets_at = msg_json.get('resetsAt')
            if resets_at is not None:
                timestamp = resets_at / 1000.0 if resets_at > 1e11 else resets_at
                return (
                    f'Rate limited by Claude.ai. Resets at {time.ctime(timestamp)}.',
                    timestamp,
                )
        except Exception:
            if raw_msg:
                return f'Rate limited by Claude.ai: {raw_msg}', None
    except Exception:
        pass
    return default_msg, None


def _build_completion_payload(prompt: str, model: str, *, minimal_tools: bool = True) -> dict:
    extras = _load_browser_extras()
    tools = _MINIMAL_TOOLS if minimal_tools else extras.get('tools', [])
    return {
        'prompt': prompt,
        'timezone': 'UTC',
        'personalized_styles': extras.get('personalized_styles', []),
        'locale': 'en-US',
        'model': model,
        'tools': tools,
        'turn_message_uuids': {
            'human_message_uuid': str(uuid.uuid4()),
            'assistant_message_uuid': str(uuid.uuid4()),
        },
        'attachments': [],
        'files': [],
        'sync_sources': [],
        'rendering_mode': 'messages',
    }


def compose_prompt(system_prompt: str, user_message: str) -> str:
    system = (system_prompt or '').strip()
    user = (user_message or '').strip()
    if system and user:
        return system + '\n\n' + user
    return system or user


def create_conversation(
    session_key: str,
    org_id: str,
    title: str = 'DNS Shield',
    model: str = _DEFAULT_MODEL,
    system_prompt: Optional[str] = None,
    max_retries: int = 3,
) -> str:
    from curl_cffi import requests

    org_id = normalize_org_id(org_id)
    if not org_id:
        raise ClaudeOrgError('org_id is empty — set Organization ID in Claude account settings')
    if not session_key:
        raise ClaudeAuthError('session_key is empty')

    conv_id = str(uuid.uuid4())
    headers = get_headers(session_key)
    max_retries = max(1, int(max_retries or 1))
    retry_delay = 5
    response = None

    for attempt in range(max_retries):
        response = requests.post(
            f'https://claude.ai/api/organizations/{org_id}/chat_conversations',
            headers=headers,
            json={
                'uuid': conv_id,
                'name': title or '',
                'model': model,
                'system_prompt': system_prompt or '',
            },
            impersonate='chrome120',
            timeout=30,
        )
        # 429 = rate limit, 529 = Claude temporarily overloaded
        if response.status_code in (429, 529) and attempt < max_retries - 1:
            time.sleep(retry_delay)
            retry_delay *= 2
            continue
        break

    if response is None:
        raise RuntimeError('Create conversation failed — no response')

    if response.status_code not in (200, 201):
        if response.status_code in (401, 403):
            raise ClaudeAuthError(f'Auth failed (HTTP {response.status_code}) — session key expired')
        if response.status_code == 404:
            raise ClaudeOrgError(
                f'Organization not found (HTTP 404) — check org_id: {org_id!r}'
            )
        if response.status_code == 429:
            err_msg, resets_at = parse_rate_limit_error(response, 'Rate limited on create')
            raise ClaudeRateLimitError(err_msg, resets_at)
        if response.status_code == 529:
            raise ClaudeRateLimitError(
                'Claude.ai is temporarily overloaded (HTTP 529). Try again shortly.'
            )
        raise RuntimeError(
            f'Create conversation failed (HTTP {response.status_code}): {response.text[:300]}'
        )

    time.sleep(1)
    return conv_id


def ask_claude(
    session_key: str,
    org_id: str,
    prompt: str,
    conv_id: str,
    model: str = _DEFAULT_MODEL,
    *,
    minimal_tools: bool = True,
    max_retries: int = 4,
) -> tuple[str, int, int]:
    from curl_cffi import requests

    org_id = normalize_org_id(org_id)
    headers = get_headers(session_key)
    headers['Accept'] = 'text/event-stream'
    prompt_text = prompt if isinstance(prompt, str) else str(prompt)

    max_retries = max(1, int(max_retries or 1))
    retry_delay = 8
    last_resets_at = None
    rate_limit_msg = 'Rate limited on completion — wait and retry'
    response = None

    for attempt in range(max_retries):
        payload = _build_completion_payload(prompt_text, model, minimal_tools=minimal_tools)
        response = requests.post(
            f'https://claude.ai/api/organizations/{org_id}/chat_conversations/{conv_id}/completion',
            headers=headers,
            json=payload,
            impersonate='chrome120',
            stream=True,
            timeout=None,
        )
        # 429 = rate limit, 529 = temporarily overloaded — both are retryable
        if response.status_code in (429, 529):
            if response.status_code == 429:
                rate_limit_msg, last_resets_at = parse_rate_limit_error(response, rate_limit_msg)
            else:
                rate_limit_msg = 'Claude.ai is temporarily overloaded (HTTP 529). Try again shortly.'
                last_resets_at = None
                # Consume stream/body so the connection can close cleanly before retry
                _read_error_body(response)
            if attempt < max_retries - 1:
                wait = retry_delay
                if last_resets_at and last_resets_at > time.time():
                    wait = max(wait, int(last_resets_at - time.time()) + 2)
                logger.warning('Claude HTTP %s — waiting %ss', response.status_code, wait)
                time.sleep(wait)
                retry_delay = min(int(retry_delay * 1.5), 120)
                continue
        break

    if response is None:
        raise RuntimeError('Completion failed — no response')

    if response.status_code != 200:
        if response.status_code in (401, 403):
            raise ClaudeAuthError(f'Auth failed (HTTP {response.status_code}) — session key expired')
        if response.status_code == 429:
            raise ClaudeRateLimitError(rate_limit_msg, last_resets_at)
        if response.status_code == 529:
            raise ClaudeRateLimitError(
                'Claude.ai is temporarily overloaded (HTTP 529). Try again shortly.'
            )
        body_text = _read_error_body(response)
        raise RuntimeError(f'Completion failed (HTTP {response.status_code}): {body_text[:500]}')

    full_text = ''
    input_tokens = 0
    output_tokens = 0
    for line in response.iter_lines():
        if not line:
            continue
        decoded = line.decode('utf-8')
        if not decoded.startswith('data:'):
            continue
        try:
            data = json.loads(decoded[5:])
            dtype = data.get('type')
            if dtype == 'message_start':
                usage = data.get('message', {}).get('usage', {})
                input_tokens = usage.get('input_tokens', 0)
            elif dtype == 'content_block_delta':
                delta = data.get('delta', {})
                full_text += delta.get('text', '')
            elif dtype == 'message_delta':
                usage = data.get('usage', {})
                if 'output_tokens' in usage:
                    output_tokens = usage['output_tokens']
            elif dtype in ('message_stop', 'message_limit_reached'):
                break
        except Exception:
            pass

    if input_tokens == 0:
        input_tokens = max(len(prompt_text) // 4, 1)
    if output_tokens == 0:
        output_tokens = max(len(full_text) // 4, 1)
    return full_text, input_tokens, output_tokens


def complete(
    session_key: str,
    org_id: str,
    system_prompt: str,
    user_prompt: str,
    *,
    model: str = _DEFAULT_MODEL,
    title: str = 'DNS Shield',
) -> str:
    """Create a conversation and return the assistant text."""
    prompt = compose_prompt(system_prompt, user_prompt)
    # Instructions go in the completion body (web UI shows that), keep create system empty-ish
    conv_id = create_conversation(
        session_key,
        org_id,
        title=title,
        model=model,
        system_prompt='',
    )
    text, _, _ = ask_claude(
        session_key,
        org_id,
        prompt=prompt,
        conv_id=conv_id,
        model=model,
        minimal_tools=True,
    )
    if not (text or '').strip():
        raise ValueError('Empty response from Claude browser wrapper — check session key / org ID')
    return text.strip()


def test_connection(session_key: str, org_id: str) -> dict:
    """
    Validate sessionKey + organization ID against claude.ai without a full completion.
    Tries listing organizations first; falls back to creating a short-lived conversation.
    Raises ClaudeAuthError / ClaudeOrgError / ClaudeRateLimitError / RuntimeError on failure.
    Returns a small status dict on success.
    """
    from curl_cffi import requests

    org_id = normalize_org_id(org_id)
    if not org_id:
        raise ClaudeOrgError('org_id is empty — set Organization ID in Claude account settings')
    if not session_key:
        raise ClaudeAuthError('session_key is empty')

    headers = get_headers(session_key)
    response = requests.get(
        'https://claude.ai/api/organizations',
        headers=headers,
        impersonate='chrome120',
        timeout=20,
    )

    if response.status_code in (401, 403):
        raise ClaudeAuthError(
            f'Auth failed (HTTP {response.status_code}) — session key expired or invalid'
        )
    if response.status_code == 429:
        err_msg, resets_at = parse_rate_limit_error(response, 'Rate limited while testing connection')
        raise ClaudeRateLimitError(err_msg, resets_at)

    if response.status_code == 200:
        try:
            data = response.json()
        except Exception:
            data = None
        org_list = data if isinstance(data, list) else (data.get('data') if isinstance(data, dict) else None)
        if isinstance(org_list, list):
            matched = None
            for item in org_list:
                if not isinstance(item, dict):
                    continue
                oid = str(item.get('uuid') or item.get('id') or '').strip()
                if oid.lower() == org_id.lower():
                    matched = item
                    break
            if matched is None:
                available = [
                    str(i.get('uuid') or i.get('id') or '')
                    for i in org_list
                    if isinstance(i, dict)
                ]
                hint = ', '.join(available[:5]) if available else '(none)'
                raise ClaudeOrgError(
                    f'Organization {org_id!r} is not on this session. Available: {hint}'
                )
            return {
                'ok': True,
                'method': 'organizations',
                'org_id': org_id,
                'org_name': matched.get('name') or matched.get('display_name') or '',
            }

    # Fallback: exercise the same create path used in production
    create_conversation(
        session_key,
        org_id,
        title='DNS Shield connection test',
        system_prompt='',
        max_retries=1,
    )
    return {'ok': True, 'method': 'create_conversation', 'org_id': org_id}
