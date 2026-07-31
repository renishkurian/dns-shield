import json
import uuid
from dns.models import SystemSetting


ACCOUNTS_KEY = 'ai_claude_browser_accounts'


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
            from dns.claude_browser import create_conversation, ask_claude, compose_prompt
            used_model = model or 'claude-sonnet-5'
            account = get_default_claude_account()
            if not account:
                raise ValueError(
                    'No Claude browser accounts configured. '
                    'Add a session key + organization ID under AI settings.'
                )
            session_key = (account.get('session_key') or '').strip()
            org_id = (account.get('org_id') or '').strip()
            if not session_key or not org_id:
                raise ValueError('Default Claude browser account is missing session key or org ID.')
            prompt = compose_prompt(system_prompt, user_prompt)
            conv_id = create_conversation(
                session_key, org_id, title=f'DNS Shield ({feature})', model=used_model, system_prompt='',
            )
            response_text, tokens_in, tokens_out = ask_claude(
                session_key, org_id, prompt=prompt, conv_id=conv_id, model=used_model, minimal_tools=True,
            )
            response_text = (response_text or '').strip()
            if not response_text:
                raise ValueError('Empty response from Claude browser wrapper — check session key / org ID')

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
