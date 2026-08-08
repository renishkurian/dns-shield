import json
import uuid
import time
import threading
from dns.models import SystemSetting


ACCOUNTS_KEY = 'ai_claude_browser_accounts'

# Per-account cooldown after Claude rate/overload limits (unix timestamp).
_claude_cooldowns: dict[str, float] = {}
_claude_cooldown_lock = threading.Lock()
# Cap how long we will wait for a single rate-limit window (seconds).
_MAX_RATE_LIMIT_WAIT = 300
# When Claude returns a generic "try again later" with no reset time.
_DEFAULT_RATE_LIMIT_COOLDOWN = 90


def _account_cooldown_key(account: dict) -> str:
    return str(account.get('id') or account.get('name') or account.get('org_id') or '')


def _get_account_cooldown(account: dict) -> float:
    key = _account_cooldown_key(account)
    if not key:
        return 0.0
    with _claude_cooldown_lock:
        return float(_claude_cooldowns.get(key) or 0.0)


def _set_account_cooldown(account: dict, until: float) -> None:
    key = _account_cooldown_key(account)
    if not key:
        return
    with _claude_cooldown_lock:
        prev = float(_claude_cooldowns.get(key) or 0.0)
        _claude_cooldowns[key] = max(prev, until)


def _clear_account_cooldown(account: dict) -> None:
    key = _account_cooldown_key(account)
    if not key:
        return
    with _claude_cooldown_lock:
        _claude_cooldowns.pop(key, None)


def get_ai_config():
    """Retrieve the AI configuration from the database."""
    enabled = SystemSetting.objects.filter(key='ai_enabled', value='true').exists()
    provider = SystemSetting.objects.filter(key='ai_provider').values_list('value', flat=True).first()
    api_key = SystemSetting.objects.filter(key='ai_api_key').values_list('value', flat=True).first()
    model = SystemSetting.objects.filter(key='ai_model').values_list('value', flat=True).first()
    return enabled, provider, api_key, model


def get_claude_browser_accounts() -> list:
    raw = SystemSetting.objects.filter(key=ACCOUNTS_KEY).values_list('value', flat=True).first()
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_claude_browser_accounts(accounts: list) -> list:
    SystemSetting.objects.update_or_create(
        key=ACCOUNTS_KEY,
        defaults={
            'value': json.dumps(accounts),
            'description': 'Claude.ai browser wrapper accounts (sessionKey + org_id)',
        },
    )
    return accounts


def get_default_claude_account() -> dict | None:
    accounts = get_claude_browser_accounts()
    for a in accounts:
        if a.get('is_default'):
            return a
    return accounts[0] if accounts else None


def ordered_claude_accounts() -> list:
    """Default account first, then the rest — used for credential failover."""
    accounts = []
    for a in get_claude_browser_accounts():
        if not isinstance(a, dict):
            continue
        if not (a.get('session_key') or '').strip():
            continue
        if not (a.get('org_id') or '').strip():
            continue
        accounts.append(a)
    if not accounts:
        return []
    defaults = [a for a in accounts if a.get('is_default')]
    others = [a for a in accounts if not a.get('is_default')]
    # Preserve stored order within each group
    return defaults + others


def _rate_limit_wait_seconds(resets_at) -> float:
    """How long to cool down after a rate-limit error."""
    now = time.time()
    if resets_at and resets_at > now:
        return min(resets_at - now + 2, _MAX_RATE_LIMIT_WAIT)
    return float(_DEFAULT_RATE_LIMIT_COOLDOWN)


def _ask_via_claude_browser(system_prompt: str, user_prompt: str, model: str, feature: str):
    """
    Call Claude.ai via browser wrapper (MarketMind-style).

    MarketMind sticks to one session and retries deeply inside ask_claude (5x).
    We do the same: one create + one ask per account. Rate-limit waits happen
    *inside* ask_claude/create_conversation — we do NOT spam create+ask across
    every account in a tight loop (that burns all quotas).

    Failover rules:
    - Auth / bad org → next account immediately
    - Rate limit after deep retries → mark cooldown, try next account (skip if still cooling)
    - Empty reply / other errors → next account

    Returns (response_text, tokens_in, tokens_out, used_model_label).
    """
    from dns.claude_browser import (
        ClaudeAuthError,
        ClaudeOrgError,
        ClaudeRateLimitError,
        create_conversation,
        ask_claude,
        compose_prompt,
    )

    accounts = ordered_claude_accounts()
    if not accounts:
        raise ValueError(
            'No Claude browser accounts configured. '
            'Add a session key + organization ID under AI settings.'
        )

    used_model = model or 'claude-sonnet-5'
    prompt = compose_prompt(system_prompt, user_prompt)
    errors = []
    multi = len(accounts) > 1

    # If every account is cooling down, wait for the earliest one (once).
    now = time.time()
    cooling = [(a, _get_account_cooldown(a)) for a in accounts if _get_account_cooldown(a) > now]
    ready_count = len(accounts) - len(cooling)
    if ready_count == 0 and cooling:
        cooling.sort(key=lambda x: x[1])
        earliest, until = cooling[0]
        wait = min(until - now + 2, _MAX_RATE_LIMIT_WAIT)
        name = (earliest.get('name') or 'account').strip()
        print(f'Claude browser: all accounts cooling down — waiting {int(wait)}s for "{name}"')
        time.sleep(max(wait, 0))
        _clear_account_cooldown(earliest)

    for account in accounts:
        name = (account.get('name') or account.get('id') or 'account').strip()
        session_key = (account.get('session_key') or '').strip()
        org_id = (account.get('org_id') or '').strip()

        until = _get_account_cooldown(account)
        if until > time.time():
            left = int(until - time.time())
            msg = f'{name}: still rate-limited (cooldown {left}s left)'
            errors.append(msg)
            print(f'Claude browser skip — {msg}')
            continue

        try:
            # MarketMind: create once (internal 429 retries), then ask once (5 completion retries).
            conv_id = create_conversation(
                session_key,
                org_id,
                title=f'DNS Shield ({feature})',
                model=used_model,
                system_prompt='',
                max_retries=3,
            )
            response_text, tokens_in, tokens_out = ask_claude(
                session_key,
                org_id,
                prompt=prompt,
                conv_id=conv_id,
                model=used_model,
                minimal_tools=True,
                max_retries=5,
            )
            response_text = (response_text or '').strip()
            if not response_text:
                raise ValueError('Empty response — check session key / org ID')
            _clear_account_cooldown(account)
            label = f'{used_model}@{name}' if multi else used_model
            if errors:
                print(f'Claude browser: account "{name}" succeeded after prior failures')
            return response_text, tokens_in, tokens_out, label

        except ClaudeRateLimitError as e:
            wait = _rate_limit_wait_seconds(getattr(e, 'resets_at', None))
            _set_account_cooldown(account, time.time() + wait)
            msg = f'{name}: {e}'
            errors.append(msg)
            print(
                f'Claude browser rate limited — {msg} '
                f'(cooldown {int(wait)}s, trying next account if any)'
            )
            continue

        except (ClaudeAuthError, ClaudeOrgError) as e:
            msg = f'{name}: {e}'
            errors.append(msg)
            print(f'Claude browser account failed — {msg}')
            continue

        except Exception as e:
            msg = f'{name}: {e}'
            errors.append(msg)
            print(f'Claude browser account failed — {msg}')
            continue

    raise ValueError(
        'All Claude browser accounts failed:\n'
        + '\n'.join(f'  • {e}' for e in errors)
        + '\nWait for the Claude.ai rate-limit window to clear (often 15–60+ min), '
        'then retry once — do not spam Generate.'
    )


def _log_usage(
    user,
    feature,
    query,
    system_prompt,
    user_prompt,
    response_text,
    *,
    provider='',
    model='',
    tokens=0,
    tokens_input=0,
    tokens_output=0,
    status='ok',
    error_message='',
):
    try:
        from dns.models import AIUsageLog
        total = tokens or (tokens_input + tokens_output)
        if not total and (system_prompt or user_prompt or response_text):
            total = max(len(f'{system_prompt}{user_prompt}{response_text}') // 4, 1)
        AIUsageLog.objects.create(
            user=user if user and getattr(user, 'is_authenticated', False) else None,
            feature=feature or 'unknown',
            query=(query or '')[:255],
            prompt=f'System:\n{system_prompt}\n\nUser:\n{user_prompt}',
            response=response_text or '',
            provider=provider or '',
            model=model or '',
            tokens_estimate=total,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            status=status,
            error_message=(error_message or '')[:2000],
        )
    except Exception as log_err:
        print(f'AI Logging failed: {log_err}')


def ask_ai(system_prompt: str, user_prompt: str, user=None, feature='unknown', query='') -> str:
    """Send a prompt to the configured AI provider. Returns string response or throws ValueError."""
    enabled, provider, api_key, model = get_ai_config()
    used_model = ''
    tokens_in = 0
    tokens_out = 0
    response_text = ''

    if not enabled or not provider:
        err = 'AI Integration is not configured or is disabled.'
        _log_usage(
            user, feature, query, system_prompt, user_prompt, '',
            provider=provider or '', model='', status='error', error_message=err,
        )
        raise ValueError(err)

    if provider != 'claude_browser' and not api_key:
        err = 'AI Integration is not configured or is disabled.'
        _log_usage(
            user, feature, query, system_prompt, user_prompt, '',
            provider=provider, model='', status='error', error_message=err,
        )
        raise ValueError(err)

    try:
        if provider == 'openai':
            import openai
            used_model = model or 'gpt-4o-mini'
            client = openai.OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=used_model,
                messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt},
                ],
            )
            response_text = response.choices[0].message.content or ''
            usage = getattr(response, 'usage', None)
            if usage:
                tokens_in = getattr(usage, 'prompt_tokens', 0) or 0
                tokens_out = getattr(usage, 'completion_tokens', 0) or 0

        elif provider == 'openrouter':
            import openai
            used_model = model or 'openai/gpt-4o-mini'
            client = openai.OpenAI(
                api_key=api_key,
                base_url='https://openrouter.ai/api/v1',
                default_headers={
                    'HTTP-Referer': 'https://dns-shield.local',
                    'X-Title': 'DNS Shield',
                },
            )
            response = client.chat.completions.create(
                model=used_model,
                messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt},
                ],
            )
            response_text = response.choices[0].message.content or ''
            usage = getattr(response, 'usage', None)
            if usage:
                tokens_in = getattr(usage, 'prompt_tokens', 0) or 0
                tokens_out = getattr(usage, 'completion_tokens', 0) or 0

        elif provider == 'anthropic':
            import anthropic
            used_model = model or 'claude-3-haiku-20240307'
            client = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model=used_model,
                max_tokens=1024,
                system=system_prompt,
                messages=[{'role': 'user', 'content': user_prompt}],
            )
            response_text = response.content[0].text if response.content else ''
            usage = getattr(response, 'usage', None)
            if usage:
                tokens_in = getattr(usage, 'input_tokens', 0) or 0
                tokens_out = getattr(usage, 'output_tokens', 0) or 0

        elif provider == 'gemini':
            import google.generativeai as genai
            used_model = model or 'gemini-1.5-flash'
            genai.configure(api_key=api_key)
            gmodel = genai.GenerativeModel(
                used_model,
                system_instruction=system_prompt,
            )
            response = gmodel.generate_content(user_prompt)
            response_text = response.text or ''
            try:
                meta = getattr(response, 'usage_metadata', None)
                if meta:
                    tokens_in = getattr(meta, 'prompt_token_count', 0) or 0
                    tokens_out = getattr(meta, 'candidates_token_count', 0) or 0
            except Exception:
                pass

        elif provider == 'claude_browser':
            response_text, tokens_in, tokens_out, used_model = _ask_via_claude_browser(
                system_prompt, user_prompt, model or 'claude-sonnet-5', feature,
            )

        else:
            raise ValueError(f'Unsupported AI Provider: {provider}')

        _log_usage(
            user, feature, query, system_prompt, user_prompt, response_text,
            provider=provider, model=used_model,
            tokens_input=tokens_in, tokens_output=tokens_out,
            status='ok',
        )
        return response_text

    except Exception as e:
        _log_usage(
            user, feature, query, system_prompt, user_prompt, response_text,
            provider=provider or '', model=used_model or (model or ''),
            tokens_input=tokens_in, tokens_output=tokens_out,
            status='error', error_message=str(e),
        )
        raise


def generate_app_domains(app_name: str, user=None) -> list:
    """Generate a list of domains for a given application context."""
    system_prompt = (
        'You are a network security expert specializing in DNS blocklists. '
        "The user will provide the name of an application (e.g. 'TikTok', 'Disney+'). "
        'You must return ONLY a raw JSON array of strings representing the domains and CDNs '
        'used by that application. Do not include markdown formatting, backticks, or any other text. '
        'Example: ["netflix.com", "nflxext.com", "nflxvideo.net"]'
    )
    user_prompt = f'Application: {app_name}'

    response_text = ask_ai(system_prompt, user_prompt, user=user, feature='app_generator', query=app_name)
    try:
        clean_text = response_text.replace('```json', '').replace('```', '').strip()
        domains = json.loads(clean_text)
        if isinstance(domains, list):
            return domains
        return []
    except Exception as e:
        raise ValueError(f'AI returned malformed data: {response_text}') from e


def upsert_claude_account(payload: dict, account_id: str | None = None) -> dict:
    accounts = get_claude_browser_accounts()
    name = (payload.get('name') or '').strip()
    session_key = (payload.get('session_key') or '').strip()
    org_id = (payload.get('org_id') or '').strip()
    is_default = bool(payload.get('is_default'))

    if not name:
        raise ValueError('Account name is required.')
    if not session_key:
        raise ValueError('Session key is required.')
    if not org_id:
        raise ValueError('Organization ID is required.')

    if account_id:
        found = None
        for a in accounts:
            if a.get('id') == account_id:
                found = a
                break
        if not found:
            raise ValueError('Account not found.')
        found['name'] = name
        found['session_key'] = session_key
        found['org_id'] = org_id
        if is_default:
            for a in accounts:
                a['is_default'] = a.get('id') == account_id
        elif found.get('is_default') and not is_default:
            # Keep at least one default
            found['is_default'] = True
        save_claude_browser_accounts(accounts)
        return found

    new_id = str(uuid.uuid4())
    if is_default or not accounts:
        for a in accounts:
            a['is_default'] = False
        is_default = True
    account = {
        'id': new_id,
        'name': name,
        'session_key': session_key,
        'org_id': org_id,
        'is_default': is_default,
    }
    accounts.append(account)
    save_claude_browser_accounts(accounts)
    return account


def delete_claude_account(account_id: str) -> None:
    accounts = get_claude_browser_accounts()
    remaining = [a for a in accounts if a.get('id') != account_id]
    if len(remaining) == len(accounts):
        raise ValueError('Account not found.')
    if remaining and not any(a.get('is_default') for a in remaining):
        remaining[0]['is_default'] = True
    save_claude_browser_accounts(remaining)


def test_claude_account(account_id: str) -> dict:
    """Validate a stored Claude browser account against claude.ai."""
    from dns.claude_browser import (
        ClaudeAuthError,
        ClaudeOrgError,
        ClaudeRateLimitError,
        test_connection,
    )

    account = next(
        (a for a in get_claude_browser_accounts() if a.get('id') == account_id),
        None,
    )
    if not account:
        raise ValueError('Account not found.')

    name = (account.get('name') or account_id).strip()
    session_key = (account.get('session_key') or '').strip()
    org_id = (account.get('org_id') or '').strip()
    if not session_key or not org_id:
        raise ValueError('Account is missing session key or organization ID.')

    try:
        result = test_connection(session_key, org_id)
        org_label = (result.get('org_name') or '').strip()
        base = f'Session OK — logged in as {org_label}' if org_label else 'Session OK'
        return {
            'ok': True,
            'account_id': account_id,
            'name': name,
            'message': (
                f'{base}. Login works; AI Report can still fail if Claude is '
                'overloaded, rate-limited, or the session expires later.'
            ),
            **{k: v for k, v in result.items() if k != 'ok'},
        }
    except (ClaudeAuthError, ClaudeOrgError, ClaudeRateLimitError) as e:
        raise ValueError(str(e)) from e
    except Exception as e:
        raise ValueError(f'Connection failed: {e}') from e
